import axios from "axios";
import { JSDOM } from "jsdom";
import * as fs from "fs";
import * as path from "path";
import pLimit from "p-limit";
import { decode as decodeHtmlEntities } from "he";

async function main() {
  const inputUrl = process.argv[2];
  if (!inputUrl) {
    console.error("Usage: npx ts-node src/index.ts <URL>");
    process.exit(1);
  }

  try {
    console.log(`Fetching HTML from ${inputUrl}...`);
    const { data: html } = await axios.get(inputUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/89.0.4389.82 Safari/537.36",
      },
    });

    console.log(`Parsing DOM...`);
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const songElements = document.getElementsByClassName("song-filename");
    const b64Urls: string[] = [];
    for (let i = 0; i < songElements.length; i++) {
      const dataSrc = songElements[i].getAttribute("data-src");
      if (dataSrc) {
        b64Urls.push(dataSrc.trim());
      }
    }

    const decodedUrls = b64Urls.map((b64) => {
        const rawUrl = Buffer.from(b64, "base64").toString("utf8");
        const fixedUrl = decodeHtmlEntities(rawUrl);
        return fixedUrl;
    });

    if (decodedUrls.length === 0) {
      console.warn("No decoded URLs were found on the page.");
      return;
    }

    console.log(`Found ${decodedUrls.length} URL(s) to download.`);

    // Limit concurrency to 5 simultaneous downloads
    const limit = pLimit(5);

    const downloadPromises = decodedUrls.map((fileUrl) =>
      limit(async () => {
        try {
          console.log(`Downloading MP3 from: ${fileUrl}`);
          const response = await axios.get<ArrayBuffer>(fileUrl, {
            responseType: "arraybuffer",
            headers: {
              Origin: "https://demodb.org",
              Referer: "https://demodb.org",
            },
          });

          const filename = path.basename(new URL(fileUrl).pathname) || "download.mp3";
          const outputPath = path.join(__dirname, filename);

          fs.writeFileSync(outputPath, Buffer.from(response.data), {
            encoding: "binary",
          });
          console.log(`Saved: ${outputPath}`);
        } catch (error) {
          console.error(`Error downloading file from ${fileUrl}:`, error);
        }
      })
    );

    await Promise.all(downloadPromises);

    console.log("Done!");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
