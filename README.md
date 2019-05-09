# docx-to-pdf

## Description

Convert a Word document (.doc or .docx) in a source S3 bucket to PDF, saving the PDF to a destination S3 bucket.

This Lambda can be invoked from an AWS Step Function, or in response to an S3 "created" or SQS event.  It could 
easily be modified to support other triggers.  You probably still want to use S3 buckets, to workaround
any limits on request/response size.

Thanks to Lambda's concurrency, this approach is well-suited to variable bulk/batch higher-volume conversion workloads.

This app uses Native Documents' [docx-wasm](https://www.npmjs.com/package/@nativedocuments/docx-wasm) to perform the conversion. It does not use LibreOffice etc.

## Installation and Getting Started

Direct link to deploy https://serverlessrepo.aws.amazon.com/applications/arn:aws:serverlessrepo:us-east-1:992364115735:applications~docx-to-pdf or search for "docx-to-pdf" in the Serverless Application Repository.

Please double check you are in the AWS region you intend; this needs to be the same region as the bucket which will contain the Word documents you wish to convert.

After you click "Deploy" (bottom right corner), you'll need to wait a minute or so as CloudFormation creates resources.  When this is complete, you should see a green tick saying "Your application has been deployed"

Now go into the function: Lambda > Functions then configure an S3 or SQS trigger (or your step function), environment variables and execution role as explained below.

### S3 Trigger

This function can respond to S3 ObjectCreated events. In this case, the output PDF is the input key + .pdf.

To configure the trigger, in "Designer > Add triggers", click "S3".  The "Configure triggers" dialog appears.  

* Select a bucket  (any time a docx is added to this bucket, the function will run)

* Verify that "all object create events" is selected (or choose PUT POST or COPY)

Click "Add" (bottom right), then "Save" (top right).

### SQS Trigger

This function can respond to an SQS event, the event being a message is available on a queue you have configured in the Lambda console ("Designer > Add triggers", click "SQS").

The message should contain a body like the following:

```
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
```

The body tells the function where to find the input docx, and where to write the output PDF.

correlationId is as optional message attribute you can use if you wish.

The function will also write out an SQS message, if you have set an environment variable named SQS_WRITE_QUEUE_URL, specifying a queue. 

This message contains body:

```
{"bucket":"YOUR_OUTPUT_BUCKET_NAME","key":"YOUR.pdf"}
```

and if the function was triggered by an SQS message with a correlationId, that
correlationId may be found in the message attributes.

### AWS Step Function

If you want to use docx-to-pdf in an AWS Step Function, you don't need either of the above triggers.

Instead, add a state of type task.  Here is a working demo step function:

```
{
  "Comment": "docx-to-pdf conversion step",
  "StartAt": "DocxToPdf",
  "States": {
    "DocxToPdf": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:us-west-2:992364999735:function:cloud9-serverlessrepo-docx-to-pdf-S3Fn-Z2UN6XIPAZ8B",
  "Parameters": {
       "source_bucket.$": "$.source_bucket",
       "source_key.$": "$.source_key",
       "target_bucket.$": "$.target_bucket",
       "target_key.$": "$.target_key"    
  },
      "End": true
    }
  }
}

```

Replace the Resource value with the ARN for your Lambda (shown in the Lambda Designer, top right).

Ensure that step function's IAM role has permission to execute the Lambda.


### Registration

This application uses Native Documents docx-wasm library to perform the conversion.

So you need a ND\_DEV\_ID, ND\_DEV\_SECRET pair (or ND\_LICENSE\_URL) to use it.   We have a generous free tier, you can get your keys at https://developers.nativedocuments.com/

Now set these as environment vars in the Lambda console, as described below.

### Environment Variables

On the same screen in the Lambda Management Console for this function, scroll down to "Environment Variables":

* **ND_DEV_ID**: get this value from https://developers.nativedocuments.com/ (see Registration above)

* **ND_DEV_SECRET**: as above

* **DEPLOY_ENV**:  if 'PROD', don't write debug level logging 

If you are using an S3 trigger, you also need:

* **S3_BUCKET_OUTPUT**: the name of the S3 bucket to which the PDF will be saved (if blank, it should write to the input event bucket)

If not, you can remove S3_BUCKET_OUTPUT

If you want to write an SQS message when a conversion is done, you also need:

* **SQS_WRITE_QUEUE_URL**: the URL of the queue to which the message should be sent


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

If you are using SQS, also ensure that the Lambda's IAM role has permission to access SQS.


### Confirm installation is successful

### S3 Trigger

If you configured the S3 trigger, you can try it, by copying a Word document (doc or docx) into the S3 bucket you have set the trigger on.

To verify it works, look for a PDF in your output bucket, or check the logs in cloudwatch

### SQS Trigger

If you configured the SQS trigger, you can try it from the Lambda console 
by configuring a test event based on the Records json above.

To verify it works, look for a PDF in the output bucket you specified, or check the logs in cloudwatch.

If you specified SQS_WRITE_QUEUE_URL, you can check for an output message 
in the SQS Management Console (Queue Actions > View/Delete Messages).

### AWS Step Function

If you used the sample step function, you can "start execution", then for the input, use something like:

```
{
   "source_bucket": "MyDocxBucket",
   "source_key": "path/to/my/docx",
   "target_bucket": "MyPDFBucket",
   "target_key": "path/to/my/PDF"
}
```

substituting your own values.

To verify it works, check the execution status and/or event history, or look for a PDF in your target bucket at target key.  You can also check the logs in cloudwatch

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

For each conversion job, "RESULT: Success" or "RESULT: Failed" will be logged.  

Checking for conversion failures:

* if you are using an S3 trigger, then in the case of "RESULT: Failed", the source document will be copied to the desitnation bucket under the key "BROKEN".  This makes it easy to check for conversion failures.  If there is a failure, the reason for that failure will appear in the CloudWatch logs.

* if you are using the demo step function, the in the Step Functions Management Console, you can look for executions with status "failed".  If you click into one of these, you'll see the reason in the execution event history, under "ExecutionFailed".

Here is what may be going wrong:

* Lambda "Task timed out" or out of memory ("Process exited before completing request"). You can increase Memory and Timeout parameters in the Lambda Management console.

* **Network error** A network connection is required to validate your ND\_DEV\_ID, ND\_DEV\_SECRET (but not to perform the actual conversion)

* **TokenValidationError** mean an invalid ND\_DEV\_ID, ND\_DEV\_SECRET pair.  Did you get these from https://developers.nativedocuments.com/ and declare them in the Lambda console?

* **OperationFailedError**  Mainly thrown when loading a document. Is this a Word (doc/docx) document? Please verify it opens correctly in Microsoft Word, or drag/drop it to https://canary.nativedocuments.com/  If you continue to have issues, please try a simple "Hello World" document.

* **EngineExceptionError**  An exception in the document engine occured. Please let us know about this!


## Getting Help

If you continue to have problems, please ask a question on StackOverflow, using tags #docx-wasm, #ms-word, #pdf, #aws-lambda, and #amazon-s3 or #aws-step-functions as appropriate, or [post an issue on GitHub](https://github.com/NativeDocuments/docx-to-pdf-on-AWS-Lambda/issues).


