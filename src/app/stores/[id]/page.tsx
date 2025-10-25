
'use client';
import { getStore, getStoreImage } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { Store, Product } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { notFound, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import groceryData from '@/lib/grocery-data.json';
import { PanelLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { collection } from 'firebase/firestore';


function ProductFilterSidebar({ onFilterChange }: { onFilterChange: (filters: { categories: string[], searchTerm: string }) => void }) {
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');

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
        <CardDescription>Filter by category or search for a specific product.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        <div className="px-1">
          <Input 
            placeholder="Search products..."
            value={searchTerm}
            onChange={handleSearchChange}
          />
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
                   {Array.isArray(category.items) && category.items.map(item => <p key={item} className="text-sm text-muted-foreground ml-4">{item}</p>)}
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
  
  const sidebarContent = <ProductFilterSidebar onFilterChange={handleFilterChange} />;

  return (
    <div className="flex">
        <div className="hidden lg:block w-96 border-r h-[calc(100vh-4rem)] sticky top-16">
             {sidebarContent}
        </div>
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
                            Filter Products
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 w-full max-w-md flex flex-col">
                       <SheetHeader className="p-6 pb-0">
                          <SheetTitle>Filter Products</SheetTitle>
                          <SheetDescription>
                            Find exactly what you're looking for.
                          </SheetDescription>
                        </SheetHeader>
                        {/* The content itself has its own padding and scrolling */}
                        <div className="flex-1 overflow-y-auto">
                            {sidebarContent}
                        </div>
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
