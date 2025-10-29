import type { Store, Product } from './types';
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
  const q = query(storesCol, where('isClosed', '!=', true));
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
    if (storeData.isClosed) {
        return undefined; // Treat closed stores as not found for public viewing
    }
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

// --- Placeholder image functions ---

export const getProductImage = async (imageId: string) => await getImage(imageId);
export const getStoreImage = async (imageId: string) => await getImage(imageId);
