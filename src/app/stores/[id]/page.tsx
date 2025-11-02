
'use client';
import { getStore, getStoreImage, getProductImage, getProductPrice } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
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
                // Find first item in category to use for image
                const firstItem = Array.isArray(category.items) ? category.items[0] : null;
                if (firstItem) {
                    const imageId = `prod-${createSlug(firstItem)}`;
                    try {
                        imageMap[category.categoryName] = await getProductImage(imageId);
                    } catch (e) {
                         imageMap[category.categoryName] = { imageUrl: 'https://placehold.co/64x64/E2E8F0/64748B?text=Img', imageHint: 'placeholder' };
                    }
                } else {
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
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [storeImage, setStoreImage] = useState({ imageUrl: 'https://placehold.co/250x250/E2E8F0/64748B?text=Loading...', imageHint: 'loading' });
  const [productImages, setProductImages] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [priceDataMap, setPriceDataMap] = useState<Record<string, ProductPrice>>({});
  const [allStoreProducts, setAllStoreProducts] = useState<Product[]>([]);

  // Fetch ALL products for the store just once to determine categories
  useEffect(() => {
    if (firestore && id) {
        const productsCol = collection(firestore, 'stores', id, 'products');
        getDocs(productsCol).then(snapshot => {
            const allProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
            setAllStoreProducts(allProducts);
        });
    }
  }, [firestore, id]);

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

  const productsQuery = useMemoFirebase(() => {
    if (!firestore || !id || !selectedCategory) return null;
    
    // Create a query for the selected category with a limit
    const baseQuery = query(
        collection(firestore, 'stores', id, 'products'),
        where('category', '==', selectedCategory),
        limit(20) // CRITICAL: Limit the number of products fetched
    );

    return baseQuery;
  }, [firestore, id, selectedCategory]);
  
  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  useEffect(() => {
    if (firestore && id) {
      const fetchStoreData = async () => {
        setLoading(true);
        const storeData = await getStore(firestore, id);
        if (storeData) {
          setStore(storeData as Store);
          const image = await getStoreImage(storeData);
          setStoreImage(image);
        } else {
          notFound();
        }
        setLoading(false);
      };
      fetchStoreData();
    }
  }, [firestore, id]);

  useEffect(() => {
    const fetchProductImages = async () => {
        if (!products) return;
        const imagePromises = products.map(p => getProductImage(p.imageId));
        try {
            const resolvedImages = await Promise.all(imagePromises);
            const imageMap = products.reduce((acc, product, index) => {
                acc[product.id] = resolvedImages[index];
                return acc;
            }, {});
            setProductImages(imageMap);
        } catch(e) {
            console.error("Failed to fetch one or more product images", e);
        }
    };
    fetchProductImages();
  }, [products]);
  
  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (searchTerm) {
      return allStoreProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) && product.category === selectedCategory
      );
    }
    return products;
  }, [products, searchTerm, allStoreProducts, selectedCategory]);

  useEffect(() => {
    const fetchPrices = async () => {
        if (!firestore || filteredProducts.length === 0) return;

        const productNames = [...new Set(filteredProducts.map(p => p.name.toLowerCase()))];
        if (productNames.length === 0) return;

        const pricesRef = collection(firestore, 'productPrices');
        // Firestore 'in' query is limited to 30 items. We must batch the requests.
        const batches = [];
        for (let i = 0; i < productNames.length; i += 30) {
            batches.push(productNames.slice(i, i + 30));
        }

        const pricePromises = batches.map(batch => 
            getDocs(query(pricesRef, where(documentId(), 'in', batch)))
        );

        try {
            const snapshots = await Promise.all(pricePromises);
            const newPriceDataMap = {};
            snapshots.forEach(snapshot => {
                 snapshot.forEach(doc => {
                    newPriceDataMap[doc.id] = doc.data() as ProductPrice;
                });
            });
           
            setPriceDataMap(prev => ({...prev, ...newPriceDataMap}));
        } catch (error) {
            console.error("Error fetching product prices:", error);
        }
    };

    fetchPrices();
  }, [firestore, filteredProducts]);


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
                  <h2 className="text-2xl font-bold font-headline">{selectedCategory}</h2>
                  {!searchTerm && <p className="text-sm text-muted-foreground">Showing the first {products?.length || 0} products. Use search to find more.</p>}
                </div>
                <div className="w-full md:max-w-sm">
                    <Input 
                        placeholder={`Search in ${selectedCategory}...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {productsLoading && !searchTerm ? (
                    <p>Loading products...</p>
                ) : filteredProducts && filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => {
                    const image = productImages[product.id] || { imageUrl: 'https://placehold.co/300x300/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    const priceData = priceDataMap[product.name.toLowerCase()];
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
