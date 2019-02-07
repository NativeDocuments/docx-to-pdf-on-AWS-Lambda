# docx-to-pdf

## Description

Convert Word documents created in a source S3 bucket to PDF, saving the PDF to a destination S3 bucket.

In response to an S3 "created" event, if its is a Word (.doc or .docx) document, this application converts the document to PDF.

Thanks to Lambda's concurrency, this approach is well-suited to variable bulk/batch higher-volume conversion workloads.

This app uses Native Documents' [docx-wasm](https://www.npmjs.com/package/@nativedocuments/docx-wasm) to perform the conversion. It does not use LibreOffice etc.  

## Installation and Getting Started

Direct link to deploy https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:992364115735:applications~docx-to-pdf or search for "docx-to-pdf" in the Serverless Application Repository.

Please double check you are in the AWS region you intend; this needs to be the same region as the bucket which will contain the Word documents you wish to convert.

After you click "Deploy" (bottom right corner), you'll need to wait a minute or so as CloudFormation creates resources.  When this is complete, you should see a green tick saying "Your application has been deployed"

Now go into the function: Lambda > Functions then configure an S3 trigger, environment variables and execution role as explained below.

### Trigger

This function responds to S3 ObjectCreated events. So in "Designer > Add triggers", click "S3".  The "Configure triggers" dialog appears.  

* Select a bucket  (any time a docx is added to this bucket, the function will run)

* Verify that "all object create events" is selected (or choose PUT POST or COPY)

Click "Add" (bottom right), then "Save" (top right).

### Registration

This application uses Native Documents docx-wasm library to perform the conversion.

So you need a ND\_DEV\_ID, ND\_DEV\_SECRET pair (or ND\_LICENSE\_URL) to use it.   We have a generous free tier, you can get your keys at https://developers.nativedocuments.com/

Now set these as environment vars in the Lambda console, as described below.

### Environment Variables

On the same screen in the Lambda Management Console for this function, scroll down to "Environment Variables":

* **ND_DEV_ID**: get this value from https://developers.nativedocuments.com/ (see Registration above)

* **ND_DEV_SECRET**: as above

* **S3_BUCKET_OUTPUT**: the name of the S3 bucket to which the PDF will be saved (if blank, it should write to the input event bucket)

* **DEPLOY_ENV**:  if 'PROD', don't write debug level logging 

### Execution role

Choose or create an execution role. In IAM, confirm that role's policies includes CloudWatch Logs permissions, and also:

```
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::*"
        }
```

Without GetObject permission on the triggering bucket and PutObject permission on the output bucket, you'll get Access Denied errors.

### Confirm installation is successful

Now you can try it, by copying a Word document (doc or docx) into the source S3 bucket.

To verify it works, look for a PDF in your output bucket, or check the logs in cloudwatch


## Logging

By default, this application logs to CloudWatch at "debug" level.  You can turn debug level logging off by setting environment variable DEPLOY_ENV=PROD.

## Sizing notes

Conversion is processor bound.  Lambda allocates processor in proportion to memory.  

Experience suggests 2048MB results in enough processor that conversion is both faster and cheaper (on Lambda January 2019 pricing) than lesser amounts.  Note: Conversion uses a minimum of around 500MB RAM, and WebAssembly under Node can use a maximum of 2GB RAM.  


## Source code

To use the source code, clone the GitHub repo.

In the lambda dir, run `npm install`

Now you can use your favourite lambda development environment...


## Troubleshooting

If you are having trouble, please check the CloudWatch logs.

For each conversion job, "RESULT: Success" or "RESULT: Failed" will be logged.  In the case of "RESULT: Failed", the source document will be copied to the desitnation bucket under the key "BROKEN".  This makes it easy to check for conversion failures.

If there is a failure, the reason for that failure will appear in the CloudWatch logs.

Here is what may be going wrong:

* Lambda "Task timed out" or out of memory ("Process exited before completing request"). You can increase Memory and Timeout parameters in the Lambda Management console.

* **Network error** A network connection is required to validate your ND\_DEV\_ID, ND\_DEV\_SECRET (but not to perform the actual conversion)

* **TokenValidationError** mean an invalid ND\_DEV\_ID, ND\_DEV\_SECRET pair.  Did you get these from https://developers.nativedocuments.com/ and declare them in the Lambda console?

* **OperationFailedError**  Mainly thrown when loading a document. Is this a Word (doc/docx) document? Please verify it opens correctly in Microsoft Word, or drag/drop it to https://canary.nativedocuments.com/  If you continue to have issues, please try a simple "Hello World" document.

* **EngineExceptionError**  An exception in the document engine occured. Please let us know about this!


## Getting Help

If you continue to have problems, please ask a question on StackOverflow, using tags #docx-wasm, #ms-word, #pdf, #aws-lambda and #amazon-s3 as appropriate.


