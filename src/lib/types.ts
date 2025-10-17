
export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageId: string;
  storeId: string;
  quantity?: number;
  category?: string;
};

export type Store = {
  id: string;
  name: string;
  description: string;
  address: string;
  imageId: string;
  ownerId: string;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type Order = {
  id: string;
  customerName: string;
  address: string;
  items: CartItem[];
  total: number;
  status: 'Pending' | 'Processing' | 'Out for Delivery' | 'Delivered';
  date: string;
};

    