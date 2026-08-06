import { extractMegaplay } from './src/api/extractors';

async function main() {
    console.log("Testing extractMegaplay...");
    const url = 'https://megaplay.buzz/stream/mal/21/1/sub';
    console.log(`URL: ${url}`);
    const res = await extractMegaplay(url);
    console.log(JSON.stringify(res, null, 2));
}

main().catch(console.error);
