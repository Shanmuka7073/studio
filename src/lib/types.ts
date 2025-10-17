import { Timestamp } from "firebase/firestore";

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
  latitude: number;
  longitude: number;
};

export type CartItem = {
  product: Product;
  quantity: number;
};

export type OrderItem = {
  productId: string;
  name: string;
  quantity: number;
  price: number;
}

export type Order = {
  id: string;
  userId: string;
  storeId: string;
  customerName: string;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  items: OrderItem[];
  totalAmount: number;
  status: 'Pending' | 'Processing' | 'Out for Delivery' | 'Delivered';
  orderDate: Timestamp | Date | string; // Allow string for serialized format
  phone: string;
  email: string;
};
