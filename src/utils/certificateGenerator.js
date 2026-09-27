/**
 * Node-side helper for the certificate-generator Python plugin
 * (plugins/certificate-generator/generate_certificate.py).
 *
 * Spawns the script via child_process, passes parameters as CLI args, and
 * collects stdout as a single binary Buffer (the PDF). This is deliberately
 * NOT a string-mode capture — treating a PDF as text at any point (e.g.
 * `data.toString()`) will silently mangle bytes above 0x7F, corrupting the
 * file. stderr is collected separately and only surfaced on failure or for
 * debugging; the plugin script itself never writes anything but pure PDF
 * bytes to stdout.
 *
 * Usage:
 *   const { generateCertificate } = require("./certificateGenerator");
 *   const { buffer, certCode } = await generateCertificate({
 *     name: "Riya Kapoor",
 *     aiLevel: "Proficient",
 *     description: "has successfully completed the AI for All program.",
 *     certCode: existingVerificationCodeFromDb, // optional — omit to let the script generate one
 *   });
 *   // buffer is a Buffer of raw PDF bytes — write it to disk, stream it to
 *   // an HTTP response, or return it directly to the student dashboard.
 */

const { spawn } = require("child_process");
const path = require("path");

// Plugin lives at /src/plugins/certificate-generator, i.e. a sibling of
// this file's own /src/utils directory.
const SCRIPT_PATH = path.join(__dirname, "..", "plugins", "certificate-generator", "generate_certificate.py");

// Windows commonly only has `python`, not `python3`, on PATH — override via
// the PYTHON_BIN env var if your setup needs something else entirely
// (e.g. a virtualenv's interpreter path).
const PYTHON_BIN = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

/**
 * @param {Object} params
 * @param {string} params.name - Student's full name
 * @param {string} [params.aiLevel] - AI proficiency level (optional)
 * @param {string} params.description - Certificate body text
 * @param {string} [params.certCode] - Verification code already stored in the DB;
 *   pass this in so the PDF shows the SAME code as the database record, rather
 *   than letting the script mint an independent one.
 * @returns {Promise<{ buffer: Buffer, certCode: string }>}
 */
function generateCertificate({ name, aiLevel, description, certCode }) {
  return new Promise((resolve, reject) => {
    if (!name || !description) {
      return reject(new Error("generateCertificate requires at least { name, description }."));
    }

    const args = [
      SCRIPT_PATH,
      "--name", name,
      "--description", description,
    ];
    if (aiLevel) args.push("--ai-level", aiLevel);
    if (certCode) args.push("--cert-code", certCode);

    const child = spawn(PYTHON_BIN, args);

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      // Usually means the interpreter itself wasn't found — e.g. PYTHON_BIN
      // is wrong for this machine.
      reject(new Error(`Failed to launch "${PYTHON_BIN}": ${err.message}`));
    });

    child.on("close", (exitCode) => {
      const stderrText = Buffer.concat(stderrChunks).toString("utf-8");

      if (exitCode !== 0) {
        return reject(new Error(`Certificate generation failed (exit ${exitCode}): ${stderrText || "no stderr output"}`));
      }

      const buffer = Buffer.concat(stdoutChunks);
      if (!buffer.length || buffer.slice(0, 4).toString("ascii") !== "%PDF") {
        return reject(new Error(`Certificate script exited 0 but did not produce a valid PDF. stderr: ${stderrText}`));
      }

      // Recover the resolved cert code from the script's stderr log line
      // when the caller didn't supply one themselves.
      let resolvedCertCode = certCode || null;
      if (!resolvedCertCode) {
        const match = stderrText.match(/code=(\S+)/);
        if (match) resolvedCertCode = match[1];
      }

      resolve({ buffer, certCode: resolvedCertCode });
    });
  });
}

module.exports = { generateCertificate };
