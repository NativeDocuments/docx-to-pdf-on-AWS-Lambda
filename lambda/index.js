var docx = require("@nativedocuments/docx-wasm");
var AWS = require('aws-sdk');
var s3 = new AWS.S3();
var config = require('./configure');
var helper = require('./helper');

const log = require('lambda-log');

const Format = require("@nativedocuments/docx-wasm/formats");

// ND_LICENSE_URL, or ND_DEV_ID and ND_DEV_SECRET are read from environment
// If using the S3 trigger, S3_BUCKET_OUTPUT should be set there as well
// See README for more details

//  debug messages?  
if (process.env.DEPLOY_ENV !== 'PROD') {
    log.options.debug = true;
}

 // The use case for this app is to output PDF.  
 // But if your use case is binary .doc to docx conversion,
 // change this to Format.DOCX 
var outputAs = Format.PDF;

var srcBucket;
var srcKey;

var dstBucket; 
var dstKey; 

var INITIALISED = false;


/**
 * Lambda which converts an S3 object.  
 * It can be invoked from an AWS Step Function,
 * or by an S3 trigger.   
 */
exports.handler = async function(event, context) {
    
    var isStep = false;
    var isSQS  = false;
    var correlationId; // optional, 
    if (/* our AWS Step Function */ event.source_bucket ) {

        isStep = true;
        
        //log.warn(event);
        srcBucket = event.source_bucket;
        srcKey = event.source_key;    
        
        dstBucket = event.target_bucket;
        dstKey = event.target_key;
        
    } else if (/* Lambda S3 trigger */ event.Records && event.Records[0].eventSource === 'aws:s3') {
        
        //log.debug("received an S3 event");
        //log.debug(event);
        
        // Object key may have spaces or unicode non-ASCII characters.
        srcBucket = event.Records[0].s3.bucket.name;
        srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  

        // Avoid identity conversion, especially srcbucket == dstbucket
        // where we'd cause an event loop 
        if (srcKey.endsWith('docx') && outputAs==Format.DOCX ) {
            log.warn('Identity conversion avoided');
            return;
        }

        // if dstBucket is undefined, we'll use source bucket.
        dstBucket = process.env.S3_BUCKET_OUTPUT;
        if (dstBucket === undefined) {
            dstBucket = srcBucket;
        }
        
        // dstKey is computed below
        if (outputAs==Format.DOCX) {
            dstKey    = srcKey + ".docx";
        } else if (outputAs==Format.PDF) {
            dstKey    = srcKey + ".pdf";
        } else {
            log.error("Unsupported output format " + outputAs);
            return;
        }

    } else if (/* SQS trigger */ event.Records && event.Records[0].eventSource === 'aws:sqs') {
        
        isSQS = true; 
        
        /*  It listens to the specific queue configured in Lambda.
         * 
         *  You can specify the batch size, but here we assume batch size = 1.
         * 
            {
              "Records": [
                {
                  "messageId": "19dd0b57-b21e-4ac1-bd88-01bbb068cb78",
                  "receiptHandle": "MessageReceiptHandle",
                  "body": { 
                    "source_bucket": "YOUR_INPUT_BUCKET_NAME", 
                    "source_key": "YOUR.docx", 
                    "target_bucket": "YOUR_OUTPUT_BUCKET_NAME", 
                    "target_key": "YOUR.pdf" 
                  },
                  "attributes": {
                    "ApproximateReceiveCount": "1",
                    "SentTimestamp": "1523232000000",
                    "SenderId": "123456789012",
                    "ApproximateFirstReceiveTimestamp": "1523232000001"
                  },
                  "messageAttributes": { "correlationId": "foo123"},
                  "md5OfBody": "7b270e59b47ff90a553787216d55d91d",
                  "eventSource": "aws:sqs",
                  "eventSourceARN": "arn:aws:sqs:us-west-2:123456789012:MyQueue",
                  "awsRegion": "us-west-2"
                }
              ]
            }
        *
        */
        
        const { body } = event.Records[0];
        log.debug(body);  
        
        srcBucket = body.source_bucket;
        srcKey = body.source_key;    

        dstBucket = body.target_bucket;
        dstKey = body.target_key; 
        
        correlationId = event.Records[0].messageAttributes.correlationId;
        //.debug(correlationId);  
        

    } else {
        // see https://stackoverflow.com/questions/41814750/how-to-know-event-souce-of-lambda-function-in-itself
        // for other event sources
        
        // Modify to suit your usecase
        log.warn("Unexpected invocation");
        log.warn(event);
        return;
    }    

    if (!srcKey.endsWith('doc') && !srcKey.endsWith('docx') ) {
        log.warn('Unsupported file type ' + srcKey);
        return; // TODO: if step function, return error?
    }
    if (srcKey.endsWith("/")) {
        // assume this is a folder; event probably triggered by copy/pasting a folder
        log.debug("is folder; returning");
        return;
    }

     // Output input URL for ease of inspection
     log.info("https://s3.console.aws.amazon.com/s3/object/" + srcBucket + "/" + srcKey);


    // Compute mimeType
    var mimeType;
    if (outputAs==Format.DOCX) {
        mimeType = Format.DOC.toString();
    } else if (outputAs==Format.PDF) {
        mimeType = Format.PDF.toString();
    } else {
        log.error("Unsupported output format " + outputAs);
        return;
    }

    // initialise engine.
    // This is inside the handler since we need to read memoryLimitInMB from context
    if (!INITIALISED) {
        try {
            config.init(context.memoryLimitInMB);
            INITIALISED = true;
        } catch (e) {
            log.error(e);
            return;
        }
    }
    var sqsQueueUrl = process.env.SQS_WRITE_QUEUE_URL;

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
        log.info('RESULT: Success ' + dstKey); /* Log analysis regex matching */

        //log.info(sqsQueueUrl);
        if (sqsQueueUrl) { 
            // send SQS message
            //log.info("write to sqs");

            // Create an SQS service object
            var sqs = new AWS.SQS({apiVersion: '2012-11-05'});
            
            var payload = {
                        bucket: dstBucket, 
                        key: dstKey
                    };            
            
            var params = {
                MessageBody: JSON.stringify(payload),
                QueueUrl: sqsQueueUrl
            }; 

            if (correlationId) {
                params = Object.assign( {
                                    MessageAttributes: { "correlationId": {
                                                                DataType: "String",
                                                                StringValue: correlationId
                                                                }
                                    }
                                }, params);
            }

            log.info(params);
            
            sqs.sendMessage(params, function(err, data) {
                if (err) {
                    log.error("Error", err);
                } else {
                    //log.debug("Success", data.MessageId);
                }
            });
        }
        
        // Return a result (useful where invoked from a step function)
        return { 'RESULT' : 'Success', "key" : dstKey };
        
    } catch (e) {

        //const msg = "" + e;
        if (e) log.error(e);
        
        if (isStep) {
            log.error("RESULT: Failed " + dstKey ); /* Log analysis regex matching */
            // Return a result (step function can catch this)
            throw e;
        }
        if (sqsQueueUrl) { 
            // TODO: write SQS message on failure?
        }
        
        /* For S3 trigger, broken documents saved to dstBucket/BROKEN
           To get help, please note the contents of the assertion,
           together with the document which caused it.
        */
        
        // save broken documents to dstBucket/BROKEN
        /* unless */ 
        if (dstBucket == srcBucket) /* to avoid repetitively processing the same document */ {
            log.error("RESULT: Failed " + srcKey);
            log.debug("cowardly refusing to write broken document to srcBucket!");
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
        } catch (putErr) {
            log.error(putErr);
            log.error("Problem saving bug doc " + dstKey );
        }
        
    }
};

