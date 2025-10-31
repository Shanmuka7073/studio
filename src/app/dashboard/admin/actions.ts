
'use server';

import type { Product, ProductVariant } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import groceryData from '@/lib/grocery-data.json';
