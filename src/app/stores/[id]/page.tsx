'use client';
import { getStore, getProducts, getStoreImage } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase, useCollection, useMemoFirebase, errorEmitter } from '@/firebase';
import { Store, Product } from '@/lib/types';
import { useEffect, useState, useTransition } from 'react';
import { notFound, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import groceryData from '@/lib/grocery-data.json';
import { useToast } from '@/hooks/use-toast';
import { writeBatch, collection, doc } from 'firebase/firestore';
import { FirestorePermissionError } from '@/firebase/errors';
import { revalidateProductPaths } from '@/app/actions';
import { PanelLeft } from 'lucide-react';


function InventoryManager({ storeId, existingProducts, onProductsAdded }: { storeId: string; existingProducts: Product[], onProductsAdded: () => void }) {
  const { toast } = useToast();
  const [isAdding, startTransition] = useTransition();
  const { firestore } = useFirebase();
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Pre-select products that are already in the store's inventory
    const initialSelection: Record<string, boolean> = {};
    existingProducts.forEach(p => {
      initialSelection[p.name] = true;
    });
    setSelectedProducts(initialSelection);
  }, [existingProducts]);

  const handleProductSelection = (productName: string, isChecked: boolean) => {
    setSelectedProducts(prev => ({ ...prev, [productName]: isChecked }));
  };
  
  const handleUpdateInventory = () => {
    if (!firestore || !storeId) return;

    const productsToAdd = Object.keys(selectedProducts).filter(key => selectedProducts[key] && !existingProducts.some(p => p.name === key));
    
    if (productsToAdd.length === 0) {
      toast({
        title: 'No new products selected',
        description: 'You did not select any new products to add.',
      });
      return;
    }
    
    startTransition(async () => {
       try {
          const batch = writeBatch(firestore);
          productsToAdd.forEach(name => {
            const newProductRef = doc(collection(firestore, 'stores', storeId, 'products'));
            batch.set(newProductRef, {
              name,
              price: 0.99, // Default price
              description: '',
              storeId: storeId,
              imageId: `prod-${Math.floor(Math.random() * 15) + 1}`, // using existing placeholder IDs
              quantity: 100, // Default quantity
            });
          });
          await batch.commit();
          toast({
            title: `${productsToAdd.length} Products Added!`,
            description: 'The selected products have been added to your inventory.',
          });
          onProductsAdded();
       } catch (serverError) {
         console.error("Failed to add products:", serverError);
          const permissionError = new FirestorePermissionError({
            path: `stores/${storeId}/products`,
            operation: 'create',
            requestResourceData: { names: productsToAdd },
          });
          errorEmitter.emit('permission-error', permissionError);
       }
    });
  };

  const selectedCount = Object.keys(selectedProducts).filter(key => selectedProducts[key]).length;
  const newProductsCount = Object.keys(selectedProducts).filter(key => selectedProducts[key] && !existingProducts.some(p => p.name === key)).length;

  return (
    <div className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Manage Inventory</CardTitle>
        <CardDescription>Select items to add to your store. Currently showing {selectedCount} items.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        <Accordion type="multiple" className="w-full">
          {groceryData.categories.map((category) => (
            <AccordionItem value={category.categoryName} key={category.categoryName}>
              <AccordionTrigger>{category.categoryName} ({category.items.filter(item => selectedProducts[item]).length}/{category.items.length})</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-4 p-4">
                  {category.items.map((item) => (
                    <div key={item} className="flex items-center space-x-2">
                      <Checkbox
                        id={`${category.categoryName}-${item}`}
                        onCheckedChange={(checked) => handleProductSelection(item, !!checked)}
                        checked={selectedProducts[item] || false}
                      />
                      <label
                        htmlFor={`${category.categoryName}-${item}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {item}
                      </label>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
      <div className="p-6 border-t">
        <Button onClick={handleUpdateInventory} disabled={isAdding || newProductsCount === 0} className="w-full">
            {isAdding ? 'Adding...' : `Add ${newProductsCount} New Products`}
        </Button>
      </div>
    </div>
  );
}


export default function StoreDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { firestore, user } = useFirebase();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  
  const productsQuery = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return collection(firestore, 'stores', id, 'products');
  }, [firestore, id]);

  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  useEffect(() => {
    if (firestore && id) {
      const fetchStoreData = async () => {
        setLoading(true);
        const storeData = await getStore(firestore, id);
        if (storeData) {
          setStore(storeData as Store);
        } else {
          notFound();
        }
        setLoading(false);
      };
      fetchStoreData();
    }
  }, [firestore, id]);

  const isStoreOwner = user && store && user.uid === store.ownerId;

  if (loading || productsLoading) {
    return <div className="container mx-auto py-12 px-4 md:px-6">Loading...</div>;
  }

  if (!store) {
    return notFound();
  }

  const image = getStoreImage(store.imageId);

  return (
    <div className="flex">
        {isStoreOwner && (
            <div className="hidden lg:block w-96 border-r h-[calc(100vh-4rem)] sticky top-16">
                 <InventoryManager storeId={store.id} existingProducts={products || []} onProductsAdded={() => revalidateProductPaths(store.id)} />
            </div>
        )}
    <div className="container mx-auto py-12 px-4 md:px-6 flex-1">
      <div className="flex flex-col md:flex-row gap-8 mb-12">
        <Image
          src={image.imageUrl}
          alt={store.name}
          data-ai-hint={image.imageHint}
          width={250}
          height={250}
          className="rounded-lg object-cover"
        />
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-bold font-headline mb-2">{store.name}</h1>
             {isStoreOwner && (
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" className="lg:hidden">
                            <PanelLeft className="mr-2 h-4 w-4" />
                            Manage Inventory
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-full max-w-md">
                        <InventoryManager storeId={store.id} existingProducts={products || []} onProductsAdded={() => revalidateProductPaths(store.id)} />
                    </SheetContent>
                </Sheet>
             )}
          </div>
          <p className="text-lg text-muted-foreground mb-2">{store.address}</p>
          <p className="text-lg">{store.description}</p>
        </div>
      </div>

      <h2 className="text-3xl font-bold font-headline mb-8">Products</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {products && products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
    </div>
  );
}
