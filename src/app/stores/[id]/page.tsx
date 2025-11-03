

'use client';
import { getStoreImage, getProductImage } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase } from '@/firebase';
import { Store, Product, ProductPrice } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { notFound, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import groceryData from '@/lib/grocery-data.json';
import { Input } from '@/components/ui/input';
import { collection, query, where, documentId, getDocs, limit } from 'firebase/firestore';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useAppStore } from '@/lib/store';
import { useCart } from '@/lib/cart';

// Helper to create a URL-friendly slug from a string
const createSlug = (text: string) => {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with -
      .replace(/[^\w-]+/g, '') // Remove all non-word chars
      .replace(/--+/g, '-') // Replace multiple - with single -
      .replace(/^-+/, '') // Trim - from start of text
      .replace(/-+$/, ''); // Trim - from end of text
};


function CategorySidebar({ categories, selectedCategory, onSelectCategory }) {
  const [images, setImages] = useState({});

    useEffect(() => {
        const fetchCategoryImages = async () => {
            const imageMap = {};
            for (const category of categories) {
                // Correctly use a dedicated category image ID
                const imageId = `cat-${createSlug(category.categoryName)}`;
                try {
                    imageMap[category.categoryName] = await getProductImage(imageId);
                } catch (e) {
                     imageMap[category.categoryName] = { imageUrl: 'https://placehold.co/64x64/E2E8F0/64748B?text=Img', imageHint: 'placeholder' };
                }
            }
            setImages(imageMap);
        };
        fetchCategoryImages();
    }, [categories]);

  return (
    <>
    {/* Desktop Sidebar */}
    <nav className="hidden md:block w-32 flex-shrink-0 border-r">
        <ScrollArea className="h-full py-4">
            <div className="space-y-4 px-2">
                {categories.map((category) => {
                    const isSelected = category.categoryName === selectedCategory;
                    const image = images[category.categoryName] || { imageUrl: 'https://placehold.co/64x64/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    return (
                    <button
                        key={category.categoryName}
                        onClick={() => onSelectCategory(category.categoryName)}
                        className={cn(
                        'flex flex-col items-center gap-2 p-2 rounded-lg w-full text-center transition-colors',
                        isSelected
                            ? 'bg-primary/10 text-primary'
                            : 'hover:bg-muted/50'
                        )}
                    >
                         <div className={cn("relative rounded-full p-1", isSelected && "ring-2 ring-primary")}>
                            <Image
                                src={image.imageUrl}
                                alt={category.categoryName}
                                width={56}
                                height={56}
                                className="rounded-full object-cover w-14 h-14"
                            />
                         </div>

                        <span className="text-xs font-medium">{category.categoryName}</span>
                    </button>
                    );
                })}
            </div>
        </ScrollArea>
    </nav>
    {/* Mobile Horizontal Scroll */}
     <div className="md:hidden border-b">
        <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex w-max space-x-2 p-4">
                {categories.map((category) => {
                     const isSelected = category.categoryName === selectedCategory;
                     const image = images[category.categoryName] || { imageUrl: 'https://placehold.co/48x48/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    return (
                         <button
                            key={category.categoryName}
                            onClick={() => onSelectCategory(category.categoryName)}
                            className={cn(
                            'flex flex-col items-center justify-start gap-2 rounded-lg w-20 text-center transition-colors flex-shrink-0',
                             isSelected ? 'text-primary' : 'hover:bg-muted/50'
                            )}
                        >
                            <div className={cn("relative rounded-full p-0.5", isSelected && "ring-2 ring-primary")}>
                                <Image
                                    src={image.imageUrl}
                                    alt={category.categoryName}
                                    width={48}
                                    height={48}
                                    className="rounded-full object-cover w-12 h-12"
                                />
                            </div>
                            <span className="text-[10px] font-medium leading-tight line-clamp-2">{category.categoryName}</span>
                        </button>
                    )
                })}
            </div>
            <ScrollBar orientation="horizontal" />
        </ScrollArea>
    </div>
    </>
  );
}


export default function StoreDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { firestore } = useFirebase();
  const { setActiveStoreId } = useCart();

  // Get all data from the central Zustand store
  const { stores, masterProducts, productPrices, loading, fetchInitialData, fetchProductPrices } = useAppStore((state) => ({
    stores: state.stores,
    masterProducts: state.masterProducts,
    productPrices: state.productPrices,
    loading: state.loading,
    fetchInitialData: state.fetchInitialData,
    fetchProductPrices: state.fetchProductPrices,
  }));

  const [storeImage, setStoreImage] = useState({ imageUrl: 'https://placehold.co/250x250/E2E8F0/64748B?text=Loading...', imageHint: 'loading' });
  const [productImages, setProductImages] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  
  // Fetch initial data if not already present
  useEffect(() => {
    if (firestore) {
      fetchInitialData(firestore);
    }
  }, [firestore, fetchInitialData]);

  // Find the current store from the Zustand store
  const store = useMemo(() => stores.find(s => s.id === id), [stores, id]);
  
  // Set the active store in the cart context when visiting this page
  useEffect(() => {
    setActiveStoreId(id);
    
    // Clear the active store when leaving the page
    return () => {
      setActiveStoreId(null);
    }
  }, [id, setActiveStoreId]);
  
  const allStoreProducts = useMemo(() => {
    if (!store || masterProducts.length === 0) return [];
    // This is a placeholder for a real implementation that would know which products belong to which store
    // For now, we assume all master products are available at every store
    return masterProducts;
  }, [store, masterProducts]);


  const storeCategories = useMemo(() => {
    if (allStoreProducts.length === 0) return [];
    const uniqueCategories = [...new Set(allStoreProducts.map(p => p.category || 'Miscellaneous'))];
    return groceryData.categories.filter(gc => uniqueCategories.includes(gc.categoryName));
  }, [allStoreProducts]);
  
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  useEffect(() => {
    if (storeCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(storeCategories[0].categoryName);
    }
  }, [storeCategories, selectedCategory]);

  useEffect(() => {
    if (store) {
      const fetchStoreImage = async () => {
        const image = await getStoreImage(store);
        setStoreImage(image);
      };
      fetchStoreImage();
    } else if (!loading) {
      // If not loading and store is not found, redirect
      notFound();
    }
  }, [store, loading]);

  const filteredProducts = useMemo(() => {
    if (allStoreProducts.length === 0) return [];
    
    if (searchTerm) {
        return allStoreProducts.filter(product =>
            product.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }

    if(selectedCategory) {
        return allStoreProducts.filter(p => p.category === selectedCategory).slice(0, 20);
    }
    
    // If no category is selected (e.g. during initial load), show nothing.
    return [];
  }, [allStoreProducts, selectedCategory, searchTerm]);
  
  // Effect to fetch prices for visible products
  useEffect(() => {
    if (firestore && filteredProducts.length > 0) {
      const productNames = filteredProducts.map(p => p.name);
      fetchProductPrices(firestore, productNames);
    }
  }, [firestore, filteredProducts, fetchProductPrices]);


  useEffect(() => {
    const fetchProductImages = async () => {
        if (!filteredProducts) return;
        const imagePromises = filteredProducts.map(p => getProductImage(p.imageId));
        try {
            const resolvedImages = await Promise.all(imagePromises);
            const imageMap = filteredProducts.reduce((acc, product, index) => {
                acc[product.id] = resolvedImages[index];
                return acc;
            }, {});
            setProductImages(imageMap);
        } catch(e) {
            console.error("Failed to fetch one or more product images", e);
        }
    };
    fetchProductImages();
  }, [filteredProducts]);


  if (loading) {
    return <div className="container mx-auto py-12 px-4 md:px-6">Loading...</div>;
  }

  if (!store) {
    return notFound();
  }
  
  return (
    <div className="flex flex-col md:flex-row min-h-screen">
      <CategorySidebar categories={storeCategories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />
        
        <div className="flex-1">
          <main className="p-4 md:p-6">
            <div className="flex justify-between items-start md:items-center mb-6 flex-col md:flex-row gap-4">
                <div>
                  <h2 className="text-2xl font-bold font-headline">{searchTerm ? "Search Results" : selectedCategory}</h2>
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? `Found ${filteredProducts.length} products` : `Showing first ${filteredProducts.length} products in this category.`}
                 </p>
                </div>
                <div className="w-full md:max-w-sm">
                    <Input 
                        placeholder={`Search all products in ${store.name}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {filteredProducts && filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => {
                    const image = productImages[product.id] || { imageUrl: 'https://placehold.co/300x300/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    // Get price data directly from the cached productPrices map
                    const priceData = productPrices[product.name.toLowerCase()];
                    return <ProductCard key={product.id} product={product} image={image} priceData={priceData} />
                    })
                ) : (
                    <p className="text-muted-foreground col-span-full">No products found matching your criteria.</p>
                )}
            </div>
          </main>
        </div>
    </div>
  );
}
