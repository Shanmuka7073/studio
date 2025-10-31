
'use client';
import { getStore, getStoreImage, getProductImage } from '@/lib/data';
import Image from 'next/image';
import ProductCard from '@/components/product-card';
import { useFirebase, useCollection, useMemoFirebase } from '@/firebase';
import { Store, Product } from '@/lib/types';
import { useEffect, useState, useMemo } from 'react';
import { notFound, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import groceryData from '@/lib/grocery-data.json';
import { Input } from '@/components/ui/input';
import { collection } from 'firebase/firestore';
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

  const productsQuery = useMemoFirebase(() => {
    if (!firestore || !id) return null;
    return collection(firestore, 'stores', id, 'products');
  }, [firestore, id]);

  const { data: products, isLoading: productsLoading } = useCollection<Product>(productsQuery);

  // Memoize categories to prevent re-renders
  const storeCategories = useMemo(() => {
    if (!products) return [];
    const uniqueCategories = [...new Set(products.map(p => p.category || 'Miscellaneous'))];
    // Find the original category objects from groceryData to preserve order and structure
    return groceryData.categories.filter(gc => uniqueCategories.includes(gc.categoryName));
  }, [products]);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Set default category once products load
  useEffect(() => {
    if (storeCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(storeCategories[0].categoryName);
    }
  }, [storeCategories, selectedCategory]);

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
    let tempProducts = [...products];

    // Filter by selected category
    if (selectedCategory) {
        tempProducts = tempProducts.filter(product => product.category === selectedCategory);
    }

    // Filter by search term
    if (searchTerm) {
      tempProducts = tempProducts.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return tempProducts;
  }, [products, selectedCategory, searchTerm]);


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
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold font-headline">{selectedCategory} ({filteredProducts.length})</h2>
                <div className="w-full max-w-sm">
                    <Input 
                        placeholder="Search in this category..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {productsLoading ? (
                    <p>Loading products...</p>
                ) : filteredProducts && filteredProducts.length > 0 ? (
                    filteredProducts.map((product) => {
                    const image = productImages[product.id] || { imageUrl: 'https://placehold.co/300x300/E2E8F0/64748B?text=...', imageHint: 'loading' };
                    return <ProductCard key={product.id} product={product} image={image} />
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
