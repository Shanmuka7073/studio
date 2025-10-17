'use server';

import {
  getProductRecommendations,
  ProductRecommendationsInput,
} from '@/ai/flows/product-recommendations';
import type { Order, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  Query,
} from 'firebase/firestore';
import { initializeServerFirebase } from '@/firebase/server-init';

export async function getRecommendationsAction(
  input: ProductRecommendationsInput
) {
  try {
    const recommendations = await getProductRecommendations(input);
    return recommendations;
  } catch (error) {
    console.error('Error getting AI recommendations:', error);
    return { error: 'Failed to get recommendations.' };
  }
}

export async function revalidateStorePaths() {
  revalidatePath('/');
  revalidatePath('/stores');
  revalidatePath('/dashboard/my-store');
}

export async function revalidateProductPaths(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/dashboard/my-store`);
}

export async function getProductsByIdsAction(
  productRefs: { productId: string; storeId: string }[]
): Promise<Product[]> {
  const { firestore } = initializeServerFirebase();
  const products: Product[] = [];

  for (const { productId, storeId } of productRefs) {
    try {
      const productDocRef = doc(
        firestore,
        'stores',
        storeId,
        'products',
        productId
      );
      const productSnap = await getDoc(productDocRef);
      if (productSnap.exists()) {
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

type GetOrdersParams = {
  by: 'userId' | 'storeId' | 'deliveryStatus';
  value: string;
};

export async function getOrdersAction({
  by,
  value,
}: GetOrdersParams): Promise<Order[]> {
  const { firestore } = initializeServerFirebase();
  const ordersCollection = collection(firestore, 'orders');
  let q: Query;

  switch (by) {
    case 'userId':
      q = query(ordersCollection, where('userId', '==', value));
      break;
    case 'storeId':
      q = query(ordersCollection, where('storeId', '==', value));
      break;
    case 'deliveryStatus':
      q = query(ordersCollection, where('status', '==', value));
      break;
    default:
      console.error(`Invalid 'by' parameter: ${by}`);
      return [];
  }

  try {
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return [];
    }

    const orders = querySnapshot.docs.map((doc) => {
      const data = doc.data();
      // Ensure orderDate is a Firestore Timestamp before converting
      const orderDate = data.orderDate as Timestamp;
      return {
        id: doc.id,
        userId: data.userId,
        storeId: data.storeId,
        customerName: data.customerName,
        deliveryAddress: data.deliveryAddress,
        deliveryLat: data.deliveryLat,
        deliveryLng: data.deliveryLng,
        items: data.items,
        totalAmount: data.totalAmount,
        status: data.status,
        orderDate: orderDate.toDate().toISOString(), // Convert Timestamp to ISO string for serialization
        phone: data.phone,
        email: data.email,
      } as Order;
    });

    // Sort by date after conversion
    orders.sort(
      (a, b) =>
        new Date(b.orderDate as string).getTime() -
        new Date(a.orderDate as string).getTime()
    );

    return orders;
  } catch (error) {
    console.error('Error fetching orders:', error);
    return [];
  }
}
