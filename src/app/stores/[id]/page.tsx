'use client';
import { getStore, getStoreImage } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase, useCollection, useMemoFirebase, errorEmitter } from '@/firebase';
import { Store, Product } from '@/lib/types';
import { useEffect, useState, useMemo, useRef } from 'react';
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
import { PanelLeft, Mic, MicOff, ShoppingCart } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useCart } from '@/lib/cart';


function VoiceResultsDialog({ open, onOpenChange, voiceResults, onAddToCart }: { open: boolean, onOpenChange: (open: boolean) => void, voiceResults: { found: Product[], notFound: string[] }, onAddToCart: (product: Product) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Voice Shopping List</DialogTitle>
          <DialogDescription>
            We found these items from your voice command. Add them to your cart.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {voiceResults.found.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Found Items</h4>
              <ul className="space-y-2">
                {voiceResults.found.map(product => (
                  <li key={product.id} className="flex items-center justify-between">
                    <div>
                      <p>{product.name}</p>
                      <p className="text-sm text-primary font-semibold">${product.price.toFixed(2)}</p>
                    </div>
                    <Button size="sm" onClick={() => onAddToCart(product)}>
                      <ShoppingCart className="mr-2 h-4 w-4" /> Add
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {voiceResults.notFound.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">Not Found</h4>
              <ul className="space-y-1">
                {voiceResults.notFound.map((item, index) => (
                  <li key={index} className="text-sm text-muted-foreground">
                    - {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InventoryManager({ storeId, existingProducts, onProductsAdded }: { storeId: string; existingProducts: Product[], onProductsAdded: () => void }) {
  const { toast } = useToast();
  const [isAdding, startTransition] = useTransition();
  const { firestore } = useFirebase();
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initialSelection: Record<string, boolean> = {};
    existingProducts.forEach(p => {
      if (p.name) initialSelection[p.name] = true;
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
    
    startTransition(() => {
       const batch = writeBatch(firestore);
       productsToAdd.forEach(name => {
         const newProductRef = doc(collection(firestore, 'stores', storeId, 'products'));
         batch.set(newProductRef, {
           name,
           price: 0.99,
           description: '',
           storeId: storeId,
           imageId: `prod-${Math.floor(Math.random() * 15) + 1}`,
           quantity: 100,
           category: groceryData.categories.find(c => c.items.includes(name))?.categoryName || 'Miscellaneous'
         });
       });
       
       batch.commit().then(() => {
         toast({
           title: `${productsToAdd.length} Products Added!`,
           description: 'The selected products have been added to your inventory.',
         });
         onProductsAdded();
       }).catch((serverError) => {
         console.error("Failed to add products:", serverError);
         const permissionError = new FirestorePermissionError({
           path: `stores/${storeId}/products`,
           operation: 'create',
           requestResourceData: { names: productsToAdd },
         });
         errorEmitter.emit('permission-error', permissionError);
         return Promise.reject(serverError);
       });
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
                        id={`owner-${category.categoryName}-${item}`}
                        onCheckedChange={(checked) => handleProductSelection(item, !!checked)}
                        checked={selectedProducts[item] || false}
                      />
                      <label
                        htmlFor={`owner-${category.categoryName}-${item}`}
                        className="text-sm font-medium leading-none"
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

function ProductFilterSidebar({ allProducts, onFilterChange, onVoiceResults }: { allProducts: Product[], onFilterChange: (filters: { categories: string[], searchTerm: string }) => void, onVoiceResults: (results: { found: Product[], notFound: string[] }) => void }) {
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isListening, setIsListening] = useState(false);
  const speechRecognition = useRef<SpeechRecognition | null>(null);

  useEffect(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn("Speech Recognition API is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    speechRecognition.current = recognition;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      
      const spokenItems = transcript.split(/,|\s+and\s+|\s+/).map(s => s.trim()).filter(Boolean);
      const found: Product[] = [];
      const notFound: string[] = [];

      spokenItems.forEach(itemText => {
        const foundProduct = allProducts.find(p => p.name.toLowerCase().includes(itemText.toLowerCase()));
        if(foundProduct) {
          if (!found.some(p => p.id === foundProduct.id)) {
            found.push(foundProduct);
          }
        } else {
          notFound.push(itemText);
        }
      });

      onVoiceResults({ found, notFound });
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

  }, [allProducts, onVoiceResults]);


  const toggleListening = () => {
    if (isListening) {
      speechRecognition.current?.stop();
    } else {
      speechRecognition.current?.start();
    }
    setIsListening(!isListening);
  };


  const handleCategorySelection = (categoryName: string, isChecked: boolean) => {
    const newSelection = { ...selectedCategories, [categoryName]: isChecked };
    setSelectedCategories(newSelection);
    const activeCategories = Object.keys(newSelection).filter(key => newSelection[key]);
    onFilterChange({ categories: activeCategories, searchTerm });
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newSearchTerm = event.target.value;
    setSearchTerm(newSearchTerm);
    const activeCategories = Object.keys(selectedCategories).filter(key => selectedCategories[key]);
    onFilterChange({ categories: activeCategories, searchTerm: newSearchTerm });
  };

  return (
    <div className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Filter Products</CardTitle>
        <CardDescription>Filter by category or search. Or use your voice to create a shopping list.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        <div className="px-1 flex items-center gap-2">
          <Input 
            placeholder="Search products..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
          <Button onClick={toggleListening} variant={isListening ? "destructive" : "outline"} size="icon">
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span className="sr-only">Toggle Voice Search</span>
          </Button>
        </div>
        <Accordion type="multiple" className="w-full">
          {groceryData.categories.map((category) => (
             <AccordionItem value={category.categoryName} key={category.categoryName}>
                <div className="flex items-center gap-2 py-4">
                    <Checkbox
                        id={`filter-${category.categoryName}`}
                        onCheckedChange={(checked) => handleCategorySelection(category.categoryName, !!checked)}
                        checked={selectedCategories[category.categoryName] || false}
                    />
                    <label htmlFor={`filter-${category.categoryName}`} className="flex-1">
                      <AccordionTrigger className="p-0 flex-1 hover:no-underline">
                          {category.categoryName}
                      </AccordionTrigger>
                    </label>
                </div>
              <AccordionContent>
                <div className="grid grid-cols-1 gap-2 p-2">
                   {category.items.map(item => <p key={item} className="text-sm text-muted-foreground ml-4">{item}</p>)}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </div>
  );
}

export default function StoreDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { firestore, user } = useFirebase();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ categories: string[], searchTerm: string }>({ categories: [], searchTerm: '' });
  const [voiceResults, setVoiceResults] = useState<{ found: Product[], notFound: string[] }>({ found: [], notFound: [] });
  const [isVoiceResultsOpen, setIsVoiceResultsOpen] = useState(false);
  const { addItem: addToCart } = useCart();
  
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
  
  const handleFilterChange = (newFilters: { categories: string[], searchTerm: string }) => {
    setFilters(newFilters);
  };

  const handleVoiceResults = (results: { found: Product[], notFound: string[] }) => {
    setVoiceResults(results);
    setIsVoiceResultsOpen(true);
  };
  
  const handleAddToCartFromVoice = (product: Product) => {
    addToCart(product);
    // Optional: close dialog or give visual feedback
  };

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    let tempProducts = [...products];

    // Filter by search term
    if (filters.searchTerm) {
      tempProducts = tempProducts.filter(product =>
        product.name.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }

    // Filter by category
    if (filters.categories.length > 0) {
      tempProducts = tempProducts.filter(product =>
        filters.categories.includes(product.category || 'Miscellaneous')
      );
    }

    return tempProducts;
  }, [products, filters]);


  const isStoreOwner = user && store && user.uid === store.ownerId;

  if (loading || productsLoading) {
    return <div className="container mx-auto py-12 px-4 md:px-6">Loading...</div>;
  }

  if (!store) {
    return notFound();
  }

  const image = getStoreImage(store.imageId);
  
  const sidebarContent = isStoreOwner 
    ? <InventoryManager storeId={store.id} existingProducts={products || []} onProductsAdded={() => revalidateProductPaths(store.id)} />
    : <ProductFilterSidebar allProducts={products || []} onFilterChange={handleFilterChange} onVoiceResults={handleVoiceResults} />;

  return (
    <div className="flex">
        <div className="hidden lg:block w-96 border-r h-[calc(100vh-4rem)] sticky top-16">
             {sidebarContent}
        </div>
        <VoiceResultsDialog 
            open={isVoiceResultsOpen}
            onOpenChange={setIsVoiceResultsOpen}
            voiceResults={voiceResults}
            onAddToCart={handleAddToCartFromVoice}
        />
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
                <Sheet>
                    <SheetTrigger asChild>
                        <Button variant="outline" className="lg:hidden">
                            <PanelLeft className="mr-2 h-4 w-4" />
                            {isStoreOwner ? 'Manage Inventory' : 'Filter Products'}
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-full max-w-md">
                        {sidebarContent}
                    </SheetContent>
                </Sheet>
              </div>
              <p className="text-lg text-muted-foreground mb-2">{store.address}</p>
              <p className="text-lg">{store.description}</p>
            </div>
          </div>

          <h2 className="text-3xl font-bold font-headline mb-8">Products ({filteredProducts.length})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredProducts && filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {filteredProducts.length === 0 && !productsLoading && (
            <p className="text-muted-foreground">No products found matching your criteria.</p>
          )}
        </div>
    </div>
  );
}

    