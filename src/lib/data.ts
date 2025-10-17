import type { Store, Product, Order } from './types';
import placeholderData from './placeholder-images.json';

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

let stores: Store[] = [];

let products: Product[] = [
  // Green Valley Organics
  {
    id: '1',
    name: 'Organic Apples',
    description: 'Crisp and sweet, perfect for snacking.',
    price: 2.99,
    imageId: 'prod-1',
    storeId: '1',
  },
  {
    id: '2',
    name: 'Organic Bananas',
    description: 'A bunch of ripe, organic bananas.',
    price: 1.99,
    imageId: 'prod-2',
    storeId: '1',
  },
  {
    id: '3',
    name: 'Sourdough Bread',
    description: 'Artisanal sourdough, baked fresh daily.',
    price: 5.49,
    imageId: 'prod-3',
    storeId: '1',
  },
  {
    id: '4',
    name: 'Organic Milk',
    description: '1 gallon of whole organic milk.',
    price: 4.99,
    imageId: 'prod-4',
    storeId: '1',
  },
  {
    id: '5',
    name: 'Free-Range Eggs',
    description: 'A dozen large, brown free-range eggs.',
    price: 3.99,
    imageId: 'prod-5',
    storeId: '1',
  },

  // City Fresh Produce
  {
    id: '6',
    name: 'Carrots',
    description: 'A bunch of fresh, sweet carrots.',
    price: 1.49,
    imageId: 'prod-6',
    storeId: '2',
  },
  {
    id: '7',
    name: 'Romaine Lettuce',
    description: 'A head of crisp romaine lettuce.',
    price: 2.29,
    imageId: 'prod-7',
    storeId: '2',
  },
  {
    id: '8',
    name: 'Vine Tomatoes',
    description: 'Juicy tomatoes, still on the vine.',
    price: 3.49,
    imageId: 'prod-8',
    storeId: '2',
  },
  {
    id: '2',
    name: 'Bananas',
    description: 'A bunch of ripe bananas.',
    price: 1.89,
    imageId: 'prod-2',
    storeId: '2',
  },
  {
    id: '1',
    name: 'Gala Apples',
    description: 'Sweet and crunchy Gala apples.',
    price: 2.79,
    imageId: 'prod-1',
    storeId: '2',
  },

  // The Corner Grocer
  {
    id: '9',
    name: 'Chicken Breast',
    description: '1 lb of boneless, skinless chicken breast.',
    price: 7.99,
    imageId: 'prod-9',
    storeId: '3',
  },
  {
    id: '10',
    name: 'Cheddar Cheese',
    description: '8oz block of sharp cheddar cheese.',
    price: 4.49,
    imageId: 'prod-10',
    storeId: '3',
  },
  {
    id: '11',
    name: 'Greek Yogurt',
    description: 'Plain Greek yogurt, 32oz tub.',
    price: 5.99,
    imageId: 'prod-11',
    storeId: '3',
  },
  {
    id: '12',
    name: 'Spaghetti Pasta',
    description: '16oz box of spaghetti.',
    price: 1.99,
    imageId: 'prod-12',
    storeId: '3',
  },
  {
    id: '13',
    name: 'White Rice',
    description: '2 lb bag of long-grain white rice.',
    price: 3.29,
    imageId: 'prod-13',
    storeId: '3',
  },
  {
    id: '14',
    name: 'Corn Flakes Cereal',
    description: '18oz box of classic corn flakes.',
    price: 3.79,
    imageId: 'prod-14',
    storeId: '3',
  },
  {
    id: '15',
    name: 'Orange Juice',
    description: 'Half-gallon of not-from-concentrate orange juice.',
    price: 4.29,
    imageId: 'prod-15',
    storeId: '3',
  },
  {
    id: '4',
    name: 'Whole Milk',
    description: '1 gallon of whole milk.',
    price: 4.79,
    imageId: 'prod-4',
    storeId: '3',
  },
];

const orders: Order[] = [
  {
    id: 'ORD001',
    customerName: 'John Doe',
    address: '123 Maple Street, Springfield, USA',
    items: [
      { product: products[0], quantity: 2 },
      { product: products[3], quantity: 1 },
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
      { product: products[8], quantity: 1 },
      { product: products[9], quantity: 1 },
      { product: products[11], quantity: 1 },
    ],
    total: 14.47,
    status: 'Processing',
    date: '2023-10-27',
  },
  {
    id: 'ORD003',
    customerName: 'Alice Johnson',
    address: '789 Pine Lane, Springfield, USA',
    items: [{ product: products[6], quantity: 3 }],
    total: 6.87,
    status: 'Out for Delivery',
    date: '2023-10-28',
  },
];

export const getStores = (): Store[] => stores;
export const getStore = (id: string): Store | undefined =>
  stores.find((s) => s.id === id);

export const createStore = (storeData: Store): Store => {
  const existingStore = stores.find(s => s.id === storeData.id);
  if (existingStore) {
    stores = stores.map(s => s.id === storeData.id ? storeData : s);
    return storeData;
  }
  stores.push(storeData);
  return storeData;
};

export const getProducts = (storeId?: string): Product[] => {
  if (storeId) {
    return products.filter((p) => p.storeId === storeId);
  }
  return products;
};

export const createProduct = (productData: Omit<Product, 'id'>): Product => {
    const newProduct = {
        ...productData,
        id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`
    };
    products.push(newProduct);
    return newProduct;
}

export const getProduct = (id: string): Product | undefined =>
  products.find((p) => p.id === id);
export const getOrders = (): Order[] => orders;
export const getProductImage = (imageId: string) => getImage(imageId);
export const getStoreImage = (imageId: string) => getImage(imageId);
