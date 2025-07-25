
import got from 'got';
import fs from 'fs/promises';

const URLS = {
    all: 'https://www.poewiki.net/index.php?title=Special:CargoExport&tables=items%2C&&fields=items.name%2C+items.base_item%2C&where=items.rarity+%3D+%22Unique%22+AND+items.drop_enabled+%3D+true&order+by=&limit=5000&format=json',
    global: 'https://www.poewiki.net/index.php?title=Special:CargoExport&tables=items%2C&&fields=items.name%2C+items.base_item%2C&where=items.rarity+%3D+%22Unique%22+AND+items.drop_enabled+%3D+true+AND+items.is_drop_restricted+%3D+false&order+by=&limit=5000&format=json'
};

const OUTPUT_PATHS = {
    all: {
        json: 'public/json/drop-enabled-uniques.json',
        js: 'public/json/drop-enabled-uniques.js',
    },
    global: {
        json: 'public/json/global-drop-enabled-uniques.json',
        js: 'public/json/global-drop-enabled-uniques.js',
    }
};

async function fetchAndSaveList(listType, url, paths) {
    console.log(`Fetching ${listType} uniques from ${url}`);
    const data = await got(url).json();
    console.log(`Successfully fetched ${data.length} ${listType} uniques.`);

    const jsonContent = JSON.stringify(data, null, 2);
    const jsContent = `export const all${listType.charAt(0).toUpperCase() + listType.slice(1)}Uniques = ${jsonContent};`;

    await fs.writeFile(paths.json, jsonContent);
    await fs.writeFile(paths.js, jsContent);
    console.log(`Successfully saved ${listType} uniques to ${paths.json} and ${paths.js}`);
}

export async function updateUniqueLists() {
    try {
        console.log('Starting update of unique item lists...');
        await Promise.all([
            fetchAndSaveList('DropEnabled', URLS.all, OUTPUT_PATHS.all),
            fetchAndSaveList('GlobalDropEnabled', URLS.global, OUTPUT_PATHS.global)
        ]);
        console.log('Finished updating unique item lists.');
    } catch (error) {
        console.error('Error updating unique item lists:', error);
        throw error; // Re-throw to be handled by the caller
    }
}
