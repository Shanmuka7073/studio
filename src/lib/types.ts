
import { Timestamp } from "firebase/firestore";

export type ProductVariant = {
  sku: string; // Unique identifier for the variant, e.g., 'prod-potatoes-1kg'
  weight: string; // e.g., '500gm', '1kg', '2kg'
  price: number;
};

export type Product = {
  id: string;
  name: string; // Base name, e.g., 'Potatoes'
  description: string;
  // Variants are no longer stored on the store-specific product document.
  // They are fetched from the central productPrices collection.
  variants?: ProductVariant[]; 
  imageId: string;
  storeId: string;
  category?: string;
  imageUrl?: string; // Data URI for AI-generated image
  imageHint?: string;
};

export type Store = {
  id: string;
  name:string;
  description: string;
  address: string;
  imageId: string;
  imageUrl?: string;
  ownerId: string;
  latitude: number;
  longitude: number;
  distance?: number;
  isClosed?: boolean;
};

export type User = {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    phoneNumber: string;
}

export type CartItem = {
  product: Product; // The base product
  variant: ProductVariant; // The specific variant chosen
  quantity: number;
};

export type OrderItem = {
  productId: string;
  productName: string;
  variantSku: string;
  variantWeight: string;
  quantity: number;
  price: number;
}

export type Order = {
  id:string;
  userId: string;
  storeId: string;
  storeOwnerId?: string; // Denormalized for security rules, optional for backwards compatibility
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
  translatedList?: string; // Bilingual translated list
  store?: Store; // Optional: Denormalized or joined store data
  deliveryPartnerId?: string | null; // ID of the user who is delivering
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

// Represents the canonical pricing for a product, managed by the admin.
export type ProductPrice = {
    productName: string; // The unique name of the product, matches the document ID.
    variants: ProductVariant[];
}

    