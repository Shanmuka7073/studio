
import type { Store, Product, ProductPrice } from './types';
// Do not import placeholderData directly anymore to avoid caching issues.
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Firestore,
} from 'firebase/firestore';

async function getImages() {
    // Dynamically import the JSON file to get the latest version.
    const placeholderData = await import('./placeholder-images.json');
    return placeholderData.placeholderImages;
}

const getImage = async (id: string) => {
  const images = await getImages();
  const image = images.find((img) => img.id === id);
  return (
    image || {
      imageUrl: 'https://picsum.photos/seed/placeholder/300/300',
      imageHint: 'placeholder',
    }
  );
};

// --- Firestore-based functions ---

export async function getStores(db: Firestore): Promise<Store[]> {
  const storesCol = collection(db, 'stores');
  // Correctly query for stores that are not closed.
  const q = query(storesCol, where('isClosed', '==', false));
  const storeSnapshot = await getDocs(q);
  const storeList = storeSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Store[];
  return storeList;
}

export async function getStore(
  db: Firestore,
  id: string
): Promise<Store | undefined> {
  const storeDocRef = doc(db, 'stores', id);
  const storeSnap = await getDoc(storeDocRef);
  if (storeSnap.exists()) {
    const storeData = { id: storeSnap.id, ...storeSnap.data() } as Store;
    // For internal use (like creating an order), we should return the store even if closed.
    // The getStores function for public listing already filters out closed stores.
    return storeData;
  }
  return undefined;
}

export async function getProducts(
  db: Firestore,
  storeId: string
): Promise<Product[]> {
  const productsQuery = query(collection(db, 'stores', storeId, 'products'));
  const productSnapshot = await getDocs(productsQuery);
  const productList = productSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as Product[];
  return productList;
}

/**
 * Fetches all products from the master "LocalBasket" store.
 * @param db The Firestore instance.
 * @returns A list of master Product objects.
 */
export async function getMasterProducts(db: Firestore): Promise<Product[]> {
    const storesQuery = query(collection(db, 'stores'), where('name', '==', 'LocalBasket'));
    const storeSnapshot = await getDocs(storesQuery);

    if (storeSnapshot.empty) {
        console.warn("Master 'LocalBasket' store not found.");
        return [];
    }

    const masterStoreId = storeSnapshot.docs[0].id;
    const productsCol = collection(db, 'stores', masterStoreId, 'products');
    const productSnapshot = await getDocs(productsCol);
    
    return productSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
}


export async function getProduct(
  db: Firestore,
  storeId: string,
  productId: string
): Promise<Product | undefined> {
  const productDocRef = doc(db, 'stores', storeId, 'products', productId);
  const productSnap = await getDoc(productDocRef);
  if (productSnap.exists()) {
    return { id: productSnap.id, ...productSnap.data() } as Product;
  }
  return undefined;
}

/**
 * Fetches the canonical price for a given product from the `productPrices` collection.
 * @param db The Firestore instance.
 * @param productName The name of the product (case-insensitive).
 * @returns The ProductPrice object or null if not found.
 */
export async function getProductPrice(db: Firestore, productName: string): Promise<ProductPrice | null> {
    if (!productName) return null;
    const priceDocRef = doc(db, 'productPrices', productName.toLowerCase());
    const priceSnap = await getDoc(priceDocRef);
    if (priceSnap.exists()) {
        return priceSnap.data() as ProductPrice;
    }
    return null;
}


// --- Placeholder image functions ---

export const getProductImage = async (imageId: string) => await getImage(imageId);
export const getStoreImage = async (store: Store) => {
    if (store.imageUrl) {
        return { imageUrl: store.imageUrl, imageHint: 'store image' };
    }
    return await getImage(store.imageId);
};
