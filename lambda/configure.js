var docx = require("@nativedocuments/docx-wasm");
const log = require('lambda-log');

exports.init = function (memoryLimitInMB) {
    
    var ndHeap, ndStream, ndScratch;
    if (memoryLimitInMB>750) {
        // 2048 MB memory is recommended:
        // - on lambda, CPU is proportional to Memory, and we are processor bound
        // - on a test workload, 2 GB is faster and cheaper the smaller configs
        // - WebAssembly can't use more than 2 GB
        var mAvail = memoryLimitInMB - 64; // node overhead, tweak this guestimate?
        if (mAvail>2040) {
            // Avoid RangeError: WebAssembly.Memory(): Property value 32848 is above the upper bound 32767
            mAvail = 2040;
        }
        ndHeap = Math.round(mAvail*.25);
        ndStream = Math.round(mAvail*.25);
        ndScratch = Math.round(mAvail*.5);
        var ndAllocation = ndHeap + ndStream + ndScratch;
        log.debug("Allocating " + ndAllocation + "MB");
        
    } else {
        // defaults!  Likely to run out of RAM
        log.debug(memoryLimitInMB + "MB available; 2048MB is recommended.");
        ndHeap = 251;
        ndStream = 256;
        ndScratch = 512;
    }
    
    docx.init({
        ENVIRONMENT: "NODE",
        LAZY_INIT: true,
        ND_MAX_HEAP_SIZE_MB: ndHeap,
        ND_MAX_STREAM_SIZE_MB: ndStream,
        ND_MAX_SCRATCH_SIZE_MB: ndScratch
    });
    log.debug("Initialised using " + memoryLimitInMB + "MB");
}
