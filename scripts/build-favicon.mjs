import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../public/favicon.svg", import.meta.url));
const sizes = [16, 32, 48];
const pngs = await Promise.all(
  sizes.map((size) =>
    sharp(source).resize(size, size).png({ compressionLevel: 9 }).toBuffer(),
  ),
);

const headerSize = 6;
const entrySize = 16;
let imageOffset = headerSize + entrySize * pngs.length;
const iconHeader = Buffer.alloc(imageOffset);
iconHeader.writeUInt16LE(0, 0);
iconHeader.writeUInt16LE(1, 2);
iconHeader.writeUInt16LE(pngs.length, 4);

pngs.forEach((png, index) => {
  const size = sizes[index];
  const entryOffset = headerSize + entrySize * index;
  iconHeader.writeUInt8(size, entryOffset);
  iconHeader.writeUInt8(size, entryOffset + 1);
  iconHeader.writeUInt8(0, entryOffset + 2);
  iconHeader.writeUInt8(0, entryOffset + 3);
  iconHeader.writeUInt16LE(1, entryOffset + 4);
  iconHeader.writeUInt16LE(32, entryOffset + 6);
  iconHeader.writeUInt32LE(png.length, entryOffset + 8);
  iconHeader.writeUInt32LE(imageOffset, entryOffset + 12);
  imageOffset += png.length;
});

await Promise.all([
  writeFile(
    new URL("../app/favicon.ico", import.meta.url),
    Buffer.concat([iconHeader, ...pngs]),
  ),
  writeFile(
    new URL("../public/favicon-32x32.png", import.meta.url),
    pngs[1],
  ),
  writeFile(
    new URL("../public/apple-touch-icon.png", import.meta.url),
    await sharp(source).resize(180, 180).png({ compressionLevel: 9 }).toBuffer(),
  ),
]);
