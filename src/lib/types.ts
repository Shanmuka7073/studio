
import { Timestamp } from "firebase/firestore";

export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  imageId: string;
  storeId: string;
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
  distance?: number;
  isClosed?: boolean;
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
  id:string;
  userId: string;
  storeId: string;
  customerName: string;
  deliveryAddress: string;
  deliveryLat: number;
  deliveryLng: number;
  items: OrderItem[];
  totalAmount: number;
  status: 'Pending' | 'Processing' | 'Out for Delivery' | 'Delivered' | 'Cancelled';
  orderDate: Timestamp | Date | string; // Allow string for serialized format
  phone: string;
  email: string;
  voiceMemoUrl?: string; // URL to the recorded voice memo
  translatedList?: string; // Bilingual translated list
  store?: Store; // Optional: Denormalized or joined store data
  deliveryPartnerId?: string; // ID of the user who is delivering
};


export type DeliveryPartner = {
  userId: string; // The user's UID
  totalEarnings: number;
  lastPayoutDate?: Timestamp;
  payoutsEnabled: boolean;
  payoutMethod?: 'bank' | 'upi';
  upiId?: string;
  bankDetails?: {
    accountHolderName: string;
    accountNumber: string;
    ifscCode: string;
  };
};

export type Payout = {
  id: string;
  partnerId: string;
  amount: number;
  requestDate: Timestamp | Date | string;
  completionDate?: Timestamp;
  status: 'pending' | 'completed' | 'failed';
  payoutMethod: 'bank' | 'upi';
  payoutDetails: any; // upiId or bankDetails
};
