const axios = require("axios");
const FormData = require("form-data");

const MAX_SIZE = 10 * 1024 * 1024;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      status: false,
      message: "Method harus POST"
    });
  }

  try {
    const chunks = [];
    let total = 0;

    for await (const chunk of req) {
      total += chunk.length;

      if (total > MAX_SIZE) {
        return res.status(413).json({
          status: false,
          message: "File maksimal 10 MB"
        });
      }

      chunks.push(chunk);
    }

    const body = Buffer.concat(chunks);

    if (!body.length) {
      return res.status(400).json({
        status: false,
        message: "File kosong"
      });
    }

    const contentType =
      req.headers["content-type"] || "";

    if (!contentType.includes("multipart/form-data")) {
      return res.status(400).json({
        status: false,
        message: "Gunakan multipart/form-data"
      });
    }

    const boundaryMatch =
      contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);

    if (!boundaryMatch) {
      return res.status(400).json({
        status: false,
        message: "Boundary multipart tidak ditemukan"
      });
    }

    const boundary =
      boundaryMatch[1] || boundaryMatch[2];

    const delimiter =
      Buffer.from("--" + boundary);

    const parts = splitBuffer(body, delimiter);

    let fileBuffer = null;
    let filename = "upload.bin";

    for (const part of parts) {
      const headerEnd =
        part.indexOf(
          Buffer.from("\r\n\r\n")
        );

      if (headerEnd === -1) continue;

      const header =
        part
          .slice(0, headerEnd)
          .toString("utf8");

      if (
        !/name="file"/i.test(header) &&
        !/name="files\[\]"/i.test(header)
      ) {
        continue;
      }

      const match =
        header.match(
          /filename="([^"]*)"/i
        );

      if (match && match[1]) {
        filename = match[1];
      }

      fileBuffer =
        part.slice(headerEnd + 4);

      if (
        fileBuffer.length >= 2 &&
        fileBuffer[fileBuffer.length - 2] === 13 &&
        fileBuffer[fileBuffer.length - 1] === 10
      ) {
        fileBuffer =
          fileBuffer.slice(0, -2);
      }

      break;
    }

    if (!fileBuffer || !fileBuffer.length) {
      return res.status(400).json({
        status: false,
        message: "File tidak ditemukan"
      });
    }

    if (fileBuffer.length > MAX_SIZE) {
      return res.status(413).json({
        status: false,
        message: "File maksimal 10 MB"
      });
    }

    const form = new FormData();

    form.append(
      "files[]",
      fileBuffer,
      {
        filename,
        knownLength: fileBuffer.length
      }
    );

    const response = await axios.post(
      "https://uguu.se/upload",
      form,
      {
        headers: form.getHeaders(),
        maxContentLength: MAX_SIZE,
        maxBodyLength: MAX_SIZE,
        timeout: 60000
      }
    );

    return res.status(response.status).json({
      status: true,
      data: response.data
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      status: false,
      message: "Upload gagal",
      error:
        error.response?.data ||
        error.message
    });
  }
};

function splitBuffer(buffer, delimiter) {
  const result = [];
  let start = 0;

  while (true) {
    const index =
      buffer.indexOf(delimiter, start);

    if (index === -1) {
      result.push(
        buffer.slice(start)
      );
      break;
    }

    if (index > start) {
      result.push(
        buffer.slice(start, index)
      );
    }

    start =
      index + delimiter.length;
  }

  return result;
}