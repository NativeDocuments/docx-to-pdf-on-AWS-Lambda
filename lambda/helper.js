var docx = require("@nativedocuments/docx-wasm");
const Format = require("@nativedocuments/docx-wasm/formats");

const log = require('lambda-log');


/**
 * Convert the doc/docx to specified output format (eg PDF)
 * @param {string} jobId - An identifier for diagnostic purposes (eg filename)
 * @param {object} docIn - Input document (a buffer or filename)
 * @param {Format} formatOut - Desired output format (eg Format.PDF)
 */
exports.convert = async function (jobId, docIn, formatOut) {

    log.debug(jobId + " await received ");
    const engine = await docx.engine();
    try {
        // load docx into engine
        await engine.load(docIn);
        log.debug(jobId + " loaded into docx_api "  );
        // now export it
        var buffer;
        if (formatOut==Format.DOCX) {
            buffer=await engine.exportDOCX();
        } else if (formatOut==Format.PDF) {
            buffer=await engine.exportPDF();
        } else {
            throw new Error("Unsupported output format " + formatOut);
        }
        // close engine
        await engine.close();    
        return buffer;
    } catch (e) {
        await engine.close();
        throw (e);
        // if (e) log.debug(e);
        // log.error("caught error loading "+srcKey);
    }
            
};
