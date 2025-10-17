import type { Store, Product } from './types';
import placeholderData from './placeholder-images.json';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Firestore,
  collectionGroup,
  where,
} from 'firebase/firestore';

const { placeholderImages } = placeholderData;

const getImage = (id: string) => {
  const image = placeholderImages.find((img) => img.id === id);
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
  const storeSnapshot = await getDocs(storesCol);
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
    return { id: storeSnap.id, ...storeSnap.data() } as Store;
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

export async function getProductsByIds(
  productRefs: { productId: string; storeId: string }[]
): Promise<Product[]> {
  if (typeof window !== 'undefined') {
    throw new Error('getProductsByIds should only be called on the server');
  }

  // This is a server-side function, we need to initialize admin app
  const { getFirestore } = await import('firebase-admin/firestore');
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');

  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
  );

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  const adminDb = getFirestore();

  const products: Product[] = [];
  for (const { productId, storeId } of productRefs) {
    try {
      const productSnap = await adminDb
        .collection('stores')
        .doc(storeId)
        .collection('products')
        .doc(productId)
        .get();
      if (productSnap.exists) {
        products.push({
          id: productSnap.id,
          ...productSnap.data(),
        } as Product);
      }
    } catch (error) {
      console.error(
        `Failed to fetch product ${productId} from store ${storeId}`,
        error
      );
    }
  }
  return products;
}

// --- Keeping placeholder image functions ---

export const getProductImage = (imageId: string) => getImage(imageId);
export const getStoreImage = (imageId: string) => getImage(imageId);
