import { FigmaService } from './apps/app/src/lib/server/services/figma-service.ts';

// Mock Fetch for node environment testing
if (!globalThis.fetch) {
    console.log("Mocking fetch...");
}

const urls = [
    "https://www.figma.com/file/liM4xeKiDT4eUxLVulk9oN/MyProject",
    "https://www.figma.com/design/liM4xeKiDT4eUxLVulk9oN/MyProject?node-id=0-1",
    "liM4xeKiDT4eUxLVulk9oN"
];

console.log("--- URL Parsing Test ---");
urls.forEach(url => {
    console.log(`URL: ${url} -> Key: ${FigmaService.extractFileKey(url)}`);
});

const key = "liM4xeKiDT4eUxLVulk9oN";
console.log(`\nExpected Key for all: ${key}`);
const successes = urls.every(u => FigmaService.extractFileKey(u) === key);
console.log(`Success: ${successes}`);
