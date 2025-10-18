'use server';

import type { Order, Product } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { initializeAdminFirebase } from '@/firebase/server-init';
import { Timestamp } from 'firebase-admin/firestore';
import type { Query } from 'firebase-admin/firestore';

export async function revalidateStorePaths() {
  revalidatePath('/');
  revalidatePath('/stores');
  revalidatePath('/dashboard/my-store');
}

export async function revalidateProductPaths(storeId: string) {
  revalidatePath(`/stores/${storeId}`);
  revalidatePath(`/dashboard/my-store`);
}

type GetOrdersParams = {
  by: 'userId' | 'storeId' | 'deliveryStatus';
  value: string;
};

export async function getOrdersAction({
  by,
  value,
}: GetOrdersParams): Promise<Order[]> {
  const { firestore } = initializeAdminFirebase();
  const ordersCollection = firestore.collection('orders');
  let q: Query;

  switch (by) {
    case 'userId':
      q = ordersCollection.where('userId', '==', value);
      break;
    case 'storeId':
      q = ordersCollection.where('storeId', '==', value);
      break;
    case 'deliveryStatus':
      q = ordersCollection.where('status', '==', value);
      break;
    default:
      console.error(`Invalid 'by' parameter: ${by}`);
      return [];
  }

  try {
    const querySnapshot = await q.get();

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
