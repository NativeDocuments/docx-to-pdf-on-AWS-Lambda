var docx = require("@nativedocuments/docx-wasm");
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var config = require('./configure');
var helper = require('./helper');

const log = require('lambda-log');

const Format = require("@nativedocuments/docx-wasm/formats");

// ND_LICENSE_URL, or ND_DEV_ID and ND_DEV_SECRET are read from environment
// S3_BUCKET_OUTPUT should be set there as well.
// See README for more details

//  debug messages?  
if (process.env.DEPLOY_ENV !== 'PROD') {
    log.options.debug = true;
}

// if dstBucket is undefined, we'll use source bucket.
var dstBucket = process.env.S3_BUCKET_OUTPUT;

 // The use case for this app is to output PDF.  
 // But if your use case is binary .doc to docx conversion,
 // change this to Format.DOCX 
var outputAs = Format.PDF;

// read from the trigger event
var srcBucket;
var srcKey;

var INITIALISED = false;


/**
 * Lambda which converts an S3 object
 */
exports.handler = async function(event, context) {

    // initialise engine.
    // This is here since we need to read memoryLimitInMB from context
    if (!INITIALISED) {
        try {
            config.init(context.memoryLimitInMB);
            INITIALISED = true;
        } catch (e) {
            log.error(e);
            return;
        }
    }

    // Object key may have spaces or unicode non-ASCII characters.
    srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    
    if (srcKey.endsWith("/")) {
        // assume this is a folder; event probably triggered by copy/pasting a folder
        log.debug("is folder; returning");
        return;
    }
    
    // Read options from the event.
    //log.debug("Reading options from event:\n", util.inspect(event, {depth: 5}));
     srcBucket = event.Records[0].s3.bucket.name;
     
     // Output input URL for ease of inspection
     log.info("https://s3.console.aws.amazon.com/s3/object/" + srcBucket + "/" + event.Records[0].s3.object.key);

    if (dstBucket === undefined) {
        dstBucket = srcBucket;
    }
    var dstKey; 
    
    // Avoid identity conversion, especially srcbucket == dstbucket
    // where we'd cause an event loop 
    if (srcKey.endsWith('docx') && outputAs==Format.DOCX ) {
        log.warn('Identity conversion avoided');
        return;
    }

    if (!srcKey.endsWith('doc') && !srcKey.endsWith('docx') ) {
        log.warn('Unsupported file type ' + srcKey);
        return;
    }

    // Compute mimeType and dstKey
    var mimeType;
    if (outputAs==Format.DOCX) {
        mimeType = Format.DOC.toString();
        dstKey    = srcKey + ".docx";
    } else if (outputAs==Format.PDF) {
        mimeType = Format.PDF.toString();
        dstKey    = srcKey + ".pdf";
    } else {
        log.error("Unsupported output format " + outputAs);
        return;
    }

    // Actually execute the steps  
    var data;
    try {
        // get the docx
        data = await s3.getObject( {Bucket: srcBucket, Key: srcKey}).promise();

        // convert it
        var output = await helper.convert(srcKey, data.Body, outputAs );

        // save the result
        log.debug("uploading to s3 " + dstBucket);
        await s3.putObject({
                Bucket: dstBucket,
                Key: dstKey,
                Body: new Buffer(output) /* arrayBuffer to Buffer  */,
                ContentType: mimeType
            }).promise();  
        log.info('RESULT: Success ' + dstKey) /* Log analysis regex matching */
        
    } catch (e) {
        /* Exceptions are logged here; and broken documents saved to dstBucket/BROKEN
           To get help, please note the contents of the assertion,
           together with the document which caused it.
        */
        const msg = "" + e;
        if (e) log.error(e);
        
        // save broken documents to dstBucket/BROKEN
        /* unless */ if (dstBucket == srcBucket) /* to avoid repetitively processing the same documnet */ {
            log.error("RESULT: Failed " + srcKey);
            log.debug("cowardly refusing to write broken document to srcBucket!")
            return;
        }
        var ext = srcKey.substr(srcKey.lastIndexOf('.') + 1);
        var mimeType;
        if (ext=="docx") {
            mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        } else if (ext=="doc") {
            mimeType = Format.DOC.toString();
        } else {
            mimeType = "application/octet-stream";
        }
        
        dstKey    = "BROKEN/" + srcKey +  "-" + (new Date).getTime() +  "." + ext;
        log.error("RESULT: Failed " + dstKey ); /* Log analysis regex matching */

        // save this bug doc
        try {
            await s3.putObject({
                    Bucket: dstBucket,
                    Key: dstKey,
                    Body: new Buffer(data.Body) /* arrayBuffer to Buffer  */,
                    ContentType: mimeType
                }).promise(); 
        } catch (e) {
            log.error(e);
            log.error("Problem saving bug doc " + dstKey )
        }
    }
};
