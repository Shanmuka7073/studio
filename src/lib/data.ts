import type { Store, Product, Order } from './types';
import placeholderData from './placeholder-images.json';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Firestore,
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

// --- Keeping placeholder image functions ---

export const getProductImage = (imageId: string) => getImage(imageId);
export const getStoreImage = (imageId: string) => getImage(imageId);

// --- Mock data for orders (can be migrated to Firestore later) ---

const MOCK_PRODUCTS: Product[] = [
    { id: '1', name: 'Organic Apples', description: 'Crisp and sweet, perfect for snacking.', price: 2.99, imageId: 'prod-1', storeId: '1' },
    { id: '4', name: 'Organic Milk', description: '1 gallon of whole organic milk.', price: 4.99, imageId: 'prod-4', storeId: '1' },
    { id: '9', name: 'Chicken Breast', description: '1 lb of boneless, skinless chicken breast.', price: 7.99, imageId: 'prod-9', storeId: '3' },
    { id: '10', name: 'Cheddar Cheese', description: '8oz block of sharp cheddar cheese.', price: 4.49, imageId: 'prod-10', storeId: '3' },
    { id: '12', name: 'Spaghetti Pasta', description: '16oz box of spaghetti.', price: 1.99, imageId: 'prod-12', storeId: '3' },
    { id: '7', name: 'Romaine Lettuce', description: 'A head of crisp romaine lettuce.', price: 2.29, imageId: 'prod-7', storeId: '2' },
]

const orders: Order[] = [
  {
    id: 'ORD001',
    customerName: 'John Doe',
    address: '123 Maple Street, Springfield, USA',
    items: [
      { product: MOCK_PRODUCTS[0], quantity: 2 },
      { product: MOCK_PRODUCTS[1], quantity: 1 },
    ],
    total: 10.97,
    status: 'Delivered',
    date: '2023-10-26',
  },
  {
    id: 'ORD002',
    customerName: 'Jane Smith',
    address: '456 Oak Avenue, Springfield, USA',
    items: [
      { product: MOCK_PRODUCTS[2], quantity: 1 },
      { product: MOCK_PRODUCTS[3], quantity: 1 },
      { product: MOCK_PRODUCTS[4], quantity: 1 },
    ],
    total: 14.47,
    status: 'Processing',
    date: '2023-10-27',
  },
  {
    id: 'ORD003',
    customerName: 'Alice Johnson',
    address: '789 Pine Lane, Springfield, USA',
    items: [{ product: MOCK_PRODUCTS[5], quantity: 3 }],
    total: 6.87,
    status: 'Out for Delivery',
    date: '2023-10-28',
  },
];
export const getOrders = (): Order[] => orders;

    