
'use server';

import { revalidatePath } from 'next/cache';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getStores, getMasterProducts } from '@/lib/data';
import { initServerApp } from '@/firebase/server-init';

const COMMANDS_FILE_PATH = path.join(process.cwd(), 'src', 'lib', 'commands.json');

type CommandGroup = {
  display: string;
  aliases: string[];
};

export async function getCommands(): Promise<Record<string, CommandGroup>> {
    try {
        const fileContent = await fs.readFile(COMMANDS_FILE_PATH, 'utf-8');
        return JSON.parse(fileContent);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            console.log("commands.json not found, returning empty object.");
            return {};
        }
        console.error("Error reading commands file:", error);
        throw new Error("Could not load commands.");
    }
}

export async function saveCommands(commands: Record<string, CommandGroup>): Promise<{ success: boolean; }> {
    try {
        const jsonContent = JSON.stringify(commands, null, 2);
        await fs.writeFile(COMMANDS_FILE_PATH, jsonContent, 'utf-8');
        return { success: true };
    } catch (error) {
        console.error("Error writing commands file:", error);
        throw new Error("Could not save commands to file.");
    }
}


export async function indexSiteContent() {
    try {
        const { firestore } = await initServerApp();
        console.log('Fetching stores and master products for indexing...');

        const stores = await getStores(firestore as any);
        const masterProducts = await getMasterProducts(firestore as any);

        console.log(`Found ${stores.length} stores.`);
        console.log(`Found ${masterProducts.length} master products.`);

        // In the future, this data can be saved to a new Firestore collection
        // for the voice commander to use.

        const indexedData = {
            stores: stores.map(s => ({ id: s.id, name: s.name, address: s.address })),
            products: masterProducts.map(p => ({ id: p.id, name: p.name, category: p.category })),
            indexedAt: new Date().toISOString(),
        };

        console.log('--- Indexed Data ---');
        console.log(JSON.stringify(indexedData, null, 2));
        console.log('--- End of Index ---');


        return {
            success: true,
            message: `Successfully indexed ${stores.length} stores and ${masterProducts.length} products. Check server console for output.`,
            storeCount: stores.length,
            productCount: masterProducts.length,
        }

    } catch (error) {
        console.error('Error indexing site content:', error);
        return {
            success: false,
            message: 'Failed to index site content. Check server logs for details.',
        };
    }
}

// This file can be extended with more server actions.
