

'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Store, Product, ProductPrice, User as AppUser } from '@/lib/types';
import { useFirebase, useDoc, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, addDoc, writeBatch, doc, updateDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import groceryData from '@/lib/grocery-data.json';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Share2, MapPin, Trash2, AlertCircle, Upload, Image as ImageIcon, Loader2, Camera, CameraOff, Sparkles, PlusCircle, Edit, Link2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { generateSingleImage } from '@/ai/flows/image-generator-flow';
import Link from 'next/link';
import { t } from '@/lib/locales';
import { useAppStore } from '@/lib/store';

const ADMIN_EMAIL = 'admin@gmail.com';

const standardWeights = ["100gm", "250gm", "500gm", "1kg", "2kg", "5kg", "1 pack", "1 pc"];

const storeSchema = z.object({
  name: z.string().min(3, 'Store name must be at least 3 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters'),
  address: z.string().min(10, 'Please enter a valid address'),
  latitude: z.coerce.number().min(-90, "Invalid latitude").max(90, "Invalid latitude"),
  longitude: z.coerce.number().min(-180, "Invalid longitude").max(180, "Invalid longitude"),
});

const locationSchema = z.object({
    latitude: z.coerce.number().min(-90).max(90),
    longitude: z.coerce.number().min(-180).max(180),
});

const variantSchema = z.object({
  sku: z.string(),
  weight: z.string().min(1, 'Weight is required'),
  price: z.coerce.number().positive('Price must be a positive number'),
});

const productSchema = z.object({
  name: z.string().min(3, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  imageUrl: z.string().optional(),
  variants: z.array(variantSchema).min(1, 'At least one price variant is required'),
});

type StoreFormValues = z.infer<typeof storeSchema>;
type ProductFormValues = z.infer<typeof productSchema>;
type LocationFormValues = z.infer<typeof locationSchema>;

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

function StoreImageUploader({ store }: { store: Store }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [isCameraOn, setIsCameraOn] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Effect to handle camera stream
    useEffect(() => {
        const setupCamera = async () => {
            if (isCameraOn) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (error) {
                    console.error("Error accessing camera:", error);
                    toast({
                        variant: 'destructive',
                        title: 'Camera Access Denied',
                        description: 'Please enable camera permissions in your browser settings.',
                    });
                    setIsCameraOn(false);
                }
            } else {
                 if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
            }
        };
        
        setupCamera();

        // Cleanup function
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isCameraOn, toast]);

    const handleToggleCamera = () => {
        setIsCameraOn(prev => !prev);
        setCapturedImage(null); // Clear previous captures when toggling
        setSelectedFile(null);
    };
    
    const handleCapture = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            if(context) {
                context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setCapturedImage(dataUrl);
                setIsCameraOn(false); // Turn off camera after capture
            }
        }
    };
    
    const handleUpload = () => {
        if (capturedImage) {
            fetch(capturedImage)
                .then(res => res.blob())
                .then(blob => {
                    uploadBlob(blob);
                });
        } else if (selectedFile) {
            uploadBlob(selectedFile);
        } else {
            return;
        }
    };

    const uploadBlob = (blob: Blob) => {
        if (!firestore) return;

        setUploading(true);
        setProgress(0);

        const storage = getStorage();
        const fileName = `${Date.now()}.jpg`;
        const storageRef = ref(storage, `store-images/${store.id}/${fileName}`);
        const uploadTask = uploadBytesResumable(storageRef, blob);

        uploadTask.on(
            'state_changed',
            (snapshot) => {
                const currentProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setProgress(currentProgress);
            },
            (error) => {
                setUploading(false);
                console.error("Upload failed:", error);
                toast({ variant: 'destructive', title: 'Upload Failed' });
            },
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                    const storeRef = doc(firestore, 'stores', store.id);
                    await updateDoc(storeRef, { imageUrl: downloadURL });
                    setUploading(false);
                    setCapturedImage(null);
                    setSelectedFile(null);
                    toast({ title: 'Image Uploaded!' });
                });
            }
        );
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files && event.target.files[0]) {
            setSelectedFile(event.target.files[0]);
            setCapturedImage(URL.createObjectURL(event.target.files[0]));
            setIsCameraOn(false);
        }
    }


    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('store-image')}</CardTitle>
                <CardDescription>{t('take-or-upload-a-picture-of-your-storefront')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                 <div className="w-full aspect-video relative rounded-md overflow-hidden border bg-muted">
                    {capturedImage ? (
                        <Image src={capturedImage} alt="Captured preview" fill className="object-cover" />
                    ) : isCameraOn ? (
                         <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                    ) : store.imageUrl ? (
                        <Image src={store.imageUrl} alt={store.name} fill className="object-cover" />
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full bg-muted/50 text-muted-foreground">
                            <ImageIcon className="h-10 w-10 mb-2" />
                            <p className="text-sm">{t('no-image-set')}</p>
                        </div>
                    )}
                </div>
                 {/* Hidden canvas for capturing frame */}
                 <canvas ref={canvasRef} style={{ display: 'none' }} />
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />


                {uploading ? (
                    <div className="space-y-2">
                        <Progress value={progress} />
                        <p className="text-xs text-center text-muted-foreground">{t('uploading')}... {Math.round(progress)}%</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <Button variant="outline" onClick={handleToggleCamera}>
                            {isCameraOn ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
                            {isCameraOn ? t('close-camera') : t('open-camera')}
                        </Button>
                        
                        {isCameraOn && !capturedImage && (
                            <Button onClick={handleCapture}>{t('capture')}</Button>
                        )}
                        
                        {!isCameraOn && !capturedImage && (
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" />
                                {t('from-device')}
                            </Button>
                        )}

                        {capturedImage && (
                             <Button onClick={handleUpload}>
                                <Upload className="mr-2 h-4 w-4" />
                                {t('upload-and-save')}
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function EditProductDialog({ storeId, product, isOpen, onOpenChange }: { storeId: string; product: Product; isOpen: boolean; onOpenChange: (open: boolean) => void; }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const { firestore } = useFirebase();

    // Fetch current prices for default values
    const priceDocRef = useMemoFirebase(() => {
        if (!firestore || !product?.name) return null;
        return doc(firestore, 'productPrices', product.name.toLowerCase());
    }, [firestore, product?.name]);
    const { data: priceData, isLoading: pricesLoading } = useDoc<ProductPrice>(priceDocRef);

    const form = useForm<ProductFormValues>({
        resolver: zodResolver(productSchema),
        defaultValues: {
            name: product.name,
            description: product.description,
            category: product.category,
            imageUrl: product.imageUrl || '',
            variants: [],
        },
    });

    useEffect(() => {
        if (isOpen) {
            form.reset({
                name: product.name,
                description: product.description,
                category: product.category,
                imageUrl: product.imageUrl || '',
                variants: priceData?.variants || [],
            });
        }
    }, [isOpen, product, priceData, form]);

    const { fields, append, remove } = useFieldArray({
        control: form.control,
        name: 'variants'
    });

    const onSubmit = (data: ProductFormValues) => {
        if (!firestore) return;

        startTransition(async () => {
            try {
                const batch = writeBatch(firestore);
                const productRef = doc(firestore, 'stores', storeId, 'products', product.id);
                
                const variantsWithSkus = data.variants.map((variant, index) => ({
                    ...variant,
                    sku: variant.sku || `${createSlug(data.name)}-${createSlug(variant.weight)}-${index}`
                }));

                const productData = {
                    name: data.name,
                    description: data.description,
                    category: data.category,
                    imageUrl: data.imageUrl,
                };
                
                batch.update(productRef, productData);

                const priceRef = doc(firestore, 'productPrices', data.name.toLowerCase());
                batch.set(priceRef, {
                    productName: data.name.toLowerCase(),
                    variants: variantsWithSkus,
                });

                await batch.commit();
                
                toast({
                    title: 'Product Updated!',
                    description: `${data.name} has been updated.`,
                });
                onOpenChange(false);

            } catch (serverError) {
                console.error("Failed to update product:", serverError);
                toast({
                    variant: 'destructive',
                    title: 'Update Failed',
                    description: 'Could not save product changes.',
                });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('edit-master-product')}</DialogTitle>
                    <DialogDescription>{t('update-details-for')} {product.name}. {t('changes-will-affect-all-stores')}</DialogDescription>
                </DialogHeader>
                {pricesLoading ? <p>Loading prices...</p> : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-h-[60vh] overflow-y-auto pr-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('product-name')}</FormLabel>
                                        <FormControl><Input {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="category"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('category')}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder={t('select-a-category')} /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {groceryData.categories.map(cat => (
                                                    <SelectItem key={cat.categoryName} value={cat.categoryName}>{cat.categoryName}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="description"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('product-description-optional')}</FormLabel>
                                        <FormControl><Textarea {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                             <FormField
                                control={form.control}
                                name="imageUrl"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('image-url')}</FormLabel>
                                        <FormControl><Input placeholder="https://example.com/image.webp" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <Card className="bg-muted/50 p-4">
                                <CardHeader className="p-2">
                                    <CardTitle className="text-lg">{t('price-variants')}</CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 space-y-4">
                                    {fields.map((field, index) => (
                                        <div key={field.id} className="flex items-end gap-2 p-3 border rounded-md bg-background">
                                            <FormField
                                                control={form.control}
                                                name={`variants.${index}.weight`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>{t('weight')}</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder={t('select-a-weight')} />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {standardWeights.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name={`variants.${index}.price`}
                                                render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>{t('price')} (₹)</FormLabel>
                                                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                    <Button type="button" variant="outline" size="sm" onClick={() => append({ weight: '', price: 0, sku: `new-${fields.length}` })}>
                                        <PlusCircle className="mr-2 h-4 w-4" /> {t('add-variant')}
                                    </Button>
                                </CardContent>
                            </Card>
                            <DialogFooter className="sticky bottom-0 bg-background pt-4">
                                <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
                                <Button type="submit" disabled={isPending}>
                                    {isPending ? t('saving') : t('save-changes')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                )}
            </DialogContent>
        </Dialog>
    );
}

function ProductChecklist({ storeId, adminStoreId }: { storeId: string; adminStoreId: string; }) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSaving, startSaveTransition] = useTransition();

  // Fetch all products from the master admin store
  const masterProductsQuery = useMemoFirebase(() => {
    if (!firestore || !adminStoreId) return null;
    return collection(firestore, 'stores', adminStoreId, 'products');
  }, [firestore, adminStoreId]);
  const { data: masterProducts, isLoading: masterProductsLoading } = useCollection<Product>(masterProductsQuery);
  
  // Fetch products currently in this owner's store
  const ownerProductsQuery = useMemoFirebase(() => {
    if (!firestore || !storeId) return null;
    return collection(firestore, 'stores', storeId, 'products');
  }, [firestore, storeId]);
  const { data: ownerProducts, isLoading: ownerProductsLoading } = useCollection<Product>(ownerProductsQuery);

  // State to manage which products are checked
  const [checkedProducts, setCheckedProducts] = useState<Record<string, boolean>>({});

  // When owner's products load, initialize the checked state
  useEffect(() => {
    if (ownerProducts) {
      const initialCheckedState = ownerProducts.reduce((acc, product) => {
        // Use master product name as the key for consistency
        acc[product.name] = true;
        return acc;
      }, {});
      setCheckedProducts(initialCheckedState);
    }
  }, [ownerProducts]);
  
  const handleCheckChange = (productName: string, isChecked: boolean) => {
    setCheckedProducts(prev => ({ ...prev, [productName]: isChecked }));
  };

  const handleSaveChanges = () => {
    startSaveTransition(async () => {
        if (!firestore || !masterProducts || !ownerProducts) return;

        const ownerProductMap = new Map(ownerProducts.map(p => [p.name, p.id]));
        const batch = writeBatch(firestore);
        let addedCount = 0;
        let removedCount = 0;

        for (const masterProduct of masterProducts) {
            const isChecked = checkedProducts[masterProduct.name] || false;
            const isInStore = ownerProductMap.has(masterProduct.name);

            if (isChecked && !isInStore) {
                // Add product to store, but WITHOUT price variants
                const newProductRef = doc(collection(firestore, 'stores', storeId, 'products'));
                const { variants, ...productData } = masterProduct;
                const newProductData = {
                  ...productData, 
                  storeId: storeId,
                };
                delete (newProductData as any).id;
                batch.set(newProductRef, newProductData);
                addedCount++;
            } else if (!isChecked && isInStore) {
                // Remove product from store
                const productIdToRemove = ownerProductMap.get(masterProduct.name);
                if (productIdToRemove) {
                    const productRef = doc(firestore, 'stores', storeId, 'products', productIdToRemove);
                    batch.delete(productRef);
                    removedCount++;
                }
            }
        }
        
        try {
            await batch.commit();
            toast({
                title: "Inventory Updated",
                description: `${addedCount} product(s) added and ${removedCount} product(s) removed.`
            });
        } catch (error) {
             console.error("Failed to update inventory:", error);
             toast({ variant: 'destructive', title: 'Update Failed', description: 'Could not update your product list.' });
        }
    });
  };

  if (masterProductsLoading || ownerProductsLoading) {
    return <p>Loading product list...</p>
  }
  
  if (!masterProducts || masterProducts.length === 0) {
      return (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('no-master-products-found')}</AlertTitle>
            <AlertDescription>{t('the-admin-has-not-added-any-products')}</AlertDescription>
          </Alert>
      )
  }
  
  const productsByCategory = masterProducts.reduce((acc, product) => {
      const category = product.category || 'Miscellaneous';
      if (!acc[category]) {
          acc[category] = [];
      }
      acc[category].push(product);
      return acc;
  }, {});


  return (
      <Card>
          <CardHeader>
              <CardTitle>{t('manage-your-inventory')}</CardTitle>
              <CardDescription>{t('select-the-products-you-want-to-sell')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
              <Accordion type="multiple" className="w-full">
                  {Object.entries(productsByCategory).map(([category, products]: [string, Product[]]) => (
                       <AccordionItem value={category} key={category}>
                          <AccordionTrigger>{t(category.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-'))}</AccordionTrigger>
                          <AccordionContent>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 p-4">
                                  {(products as Product[]).map((product) => (
                                      <div key={product.id} className="flex items-center space-x-2">
                                          <Checkbox
                                              id={product.id}
                                              checked={checkedProducts[product.name] || false}
                                              onCheckedChange={(checked) => handleCheckChange(product.name, !!checked)}
                                          />
                                          <label htmlFor={product.id} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                              {t(product.name.toLowerCase().replace(/ /g, '-'))}
                                          </label>
                                      </div>
                                  ))}
                              </div>
                          </AccordionContent>
                       </AccordionItem>
                  ))}
              </Accordion>
               <Button onClick={handleSaveChanges} disabled={isSaving} className="w-full">
                  {isSaving ? t('saving-changes') : t('save-inventory-changes')}
              </Button>
          </CardContent>
      </Card>
  )

}


function BulkUploadCard({ storeId }: { storeId: string }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [isUploading, startUploadTransition] = useTransition();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        startUploadTransition(async () => {
            try {
                const text = await file.text();
                const rows = text.split('\n').slice(1); // Skip header row
                if (rows.length === 0) {
                    toast({ variant: 'destructive', title: 'Empty CSV', description: 'The selected file has no data rows.' });
                    return;
                }

                const batch = writeBatch(firestore);
                let count = 0;

                for (const row of rows) {
                    if (!row.trim()) continue; // Skip empty rows
                    
                    const [name, category, description, imageUrl, weight, price] = row.split(',').map(s => s.trim());
                    
                    if (!name || !category || !weight || !price) {
                        console.warn(`Skipping invalid row: ${row}`);
                        continue;
                    }
                    
                    const productNameLower = name.toLowerCase();
                    const imageId = `prod-${createSlug(name)}`;
                    
                    // 1. Add product to the master /stores/{adminId}/products collection
                    const productRef = doc(collection(firestore, 'stores', storeId, 'products'));
                    batch.set(productRef, {
                        name,
                        category,
                        description: description || '',
                        imageUrl: imageUrl || '',
                        storeId,
                        imageId: imageId,
                        imageHint: productNameLower,
                    });

                    // 2. Add pricing info to the canonical /productPrices collection
                    const priceRef = doc(firestore, 'productPrices', productNameLower);
                    const newVariant: Omit<z.infer<typeof variantSchema>, 'sku'> = {
                        weight,
                        price: Number(price)
                    };
                    batch.set(priceRef, {
                        productName: productNameLower,
                        variants: [{
                            ...newVariant,
                            sku: `${createSlug(name)}-${createSlug(weight)}-0`
                        }]
                    }, { merge: true }); // Use merge to add to existing variants if product exists

                    count++;
                }

                if (count > 0) {
                    await batch.commit();
                    toast({
                        title: 'Upload Complete!',
                        description: `Successfully processed and added ${count} products.`,
                    });
                } else {
                     toast({
                        variant: 'destructive',
                        title: 'No Valid Data',
                        description: 'Could not find any valid rows to process in the CSV file.',
                    });
                }

            } catch (error) {
                console.error("CSV Upload failed:", error);
                toast({ variant: 'destructive', title: 'Upload Failed', description: 'There was an error processing your file.' });
            } finally {
                // Reset the file input
                if(fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        });
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Bulk Product Upload</CardTitle>
                <CardDescription>
                    Upload a CSV file to add multiple products at once. The format should be: `name,category,description,imageUrl,weight,price`
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    disabled={isUploading}
                />
                 {isUploading && (
                    <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Processing your file... this may take a moment.</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function AddProductForm({ storeId, isAdmin }: { storeId: string; isAdmin: boolean; }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { firestore } = useFirebase();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', description: '', category: '', imageUrl: '', variants: [{ sku: '', weight: '', price: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'variants'
  });

  const handleTemplateSelect = (value: string) => {
    if (!value) return;
    const [itemName, categoryName] = value.split('::');
    form.setValue('name', itemName);
    form.setValue('category', categoryName);
  };

  const handleGenerateImage = async () => {
    const productName = form.getValues('name');
    if (!productName) {
        toast({
            variant: 'destructive',
            title: 'Product Name Required',
            description: 'Please enter a product name before generating an image.',
        });
        return;
    }

    setIsGeneratingImage(true);
    try {
        const imageUrl = await generateSingleImage(productName);
        if (imageUrl) {
            form.setValue('imageUrl', imageUrl);
            toast({
                title: 'Image Generated!',
                description: 'The AI-generated image URL has been added.',
            });
        } else {
            throw new Error('Image generation returned no URL.');
        }
    } catch (error) {
        console.error("Image generation failed:", error);
        toast({
            variant: 'destructive',
            title: 'Image Generation Failed',
            description: 'Could not generate image. Please try again or add a URL manually.',
        });
    } finally {
        setIsGeneratingImage(false);
    }
  };

  const onSubmit = (data: ProductFormValues) => {
    if (!firestore) return;
    if (!isAdmin) {
        toast({ variant: 'destructive', title: 'Unauthorized', description: 'Only admins can create new master products.'});
        return;
    }

    startTransition(async () => {
      try {
        const batch = writeBatch(firestore);
        const imageId = `prod-${createSlug(data.name)}`;
        
        const variantsWithSkus = data.variants.map((variant, index) => ({
            ...variant,
            sku: `${createSlug(data.name)}-${createSlug(variant.weight)}-${index}`
        }));

        // 1. Add product to the master /stores/{adminId}/products collection
        const productRef = doc(collection(firestore, 'stores', storeId, 'products'));
        const productData: Omit<Product, 'id' | 'variants'> = {
          name: data.name,
          description: data.description,
          category: data.category,
          storeId,
          imageId: imageId,
          imageUrl: data.imageUrl,
          imageHint: data.name.toLowerCase(),
        };
        batch.set(productRef, productData);
        
        // 2. Add pricing info to the canonical /productPrices collection
        const priceRef = doc(firestore, 'productPrices', data.name.toLowerCase());
        batch.set(priceRef, {
            productName: data.name.toLowerCase(),
            variants: variantsWithSkus
        });
        
        await batch.commit();
        
        toast({
          title: 'Master Product Added!',
          description: `${data.name} has been added to the catalog.`,
        });
        form.reset();

      } catch (serverError) {
        console.error("Failed to create product:", serverError);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not create master product.' });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('add-a-master-product')}</CardTitle>
        <CardDescription>{t('add-a-new-product-to-the-platform')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
             <FormItem>
                <FormLabel>{t('product-template-optional')}</FormLabel>
                <Select onValueChange={handleTemplateSelect}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select-a-predefined-item')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {groceryData.categories.map(cat => (
                        cat.items.map(item => (
                            <SelectItem key={`${cat.categoryName}-${item}`} value={`${item}::${cat.categoryName}`}>
                                {item} ({cat.categoryName})
                            </SelectItem>
                        ))
                      ))}
                    </SelectContent>
                </Select>
                <FormDescription>
                    {t('select-an-item-to-auto-fill')}
                </FormDescription>
            </FormItem>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('product-name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Organic Apples" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('product-image-url-optional')}</FormLabel>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-grow">
                        <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
                        <Input placeholder="https://images.unsplash.com/..." {...field} className="pl-9" />
                    </div>
                    <Button type="button" variant="outline" onClick={handleGenerateImage} disabled={isGeneratingImage}>
                        {isGeneratingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        <span className="ml-2 hidden sm:inline">{t('generate-with-ai')}</span>
                    </Button>
                  </div>
                   <FormDescription>
                    {t('paste-a-direct-image-link-or-generate-one')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('category')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={t('select-a-category')} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {groceryData.categories.map(cat => (
                        <SelectItem key={cat.categoryName} value={cat.categoryName}>{t(cat.categoryName.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-'))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('product-description-optional')}</FormLabel>
                  <FormControl>
                    <Textarea placeholder={t('describe-the-product')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Card className="bg-muted/50 p-4">
                <CardHeader className="p-2">
                    <CardTitle className="text-lg">{t('price-variants')}</CardTitle>
                    <CardDescription className="text-xs">
                        {t('set-the-official-price-for-this-product')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-2 space-y-4">
                    {fields.map((field, index) => (
                        <div key={field.id} className="flex items-end gap-4 p-4 border rounded-md bg-background">
                            <FormField
                                control={form.control}
                                name={`variants.${index}.weight`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>{t('weight')}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('select-a-weight')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {standardWeights.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name={`variants.${index}.price`}
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>{t('price')} (₹)</FormLabel>
                                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                    <Button type="button" variant="outline" onClick={() => append({ weight: '', price: 0, sku: `new-${fields.length}` })}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {t('add-variant')}
                    </Button>
                </CardContent>
            </Card>


            <Button type="submit" disabled={isPending} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                {isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('adding-product')}...
                    </>
                ) : (
                    t('add-product')
                )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function PromoteStore({ store }: { store: Store }) {
    const { toast } = useToast();

    const handleShare = async () => {
        if (!('contacts' in navigator && 'select' in navigator.contacts)) {
            toast({
                variant: 'destructive',
                title: 'API Not Supported',
                description: 'Your browser does not support the Contact Picker API.',
            });
            return;
        }

        try {
            const contacts = await navigator.contacts.select(['name', 'email', 'tel'], { multiple: true });

            if (contacts.length === 0) {
                toast({ title: 'No contacts selected.' });
                return;
            }

            const phoneNumbers = contacts.flatMap(c => c.tel || []);
            const shareText = `Check out my store, ${store.name}, on the LocalBasket app! You can order groceries online and get them delivered right to your door. Visit my storefront here: ${window.location.origin}/stores/${store.id}`;
            
            if (phoneNumbers.length > 0) {
                 const smsLink = `sms:${phoneNumbers.join(',')}?&body=${encodeURIComponent(shareText)}`;
                 window.open(smsLink, '_blank');
            } else {
                 toast({
                    variant: 'destructive',
                    title: 'No Phone Numbers Found',
                    description: 'The selected contacts do not have phone numbers. Email sharing is not yet implemented.',
                });
            }
            
            toast({
                title: 'Contacts Selected!',
                description: `Opening your messaging app to share with ${contacts.length} contacts.`,
            });

        } catch (ex) {
            toast({
                variant: 'destructive',
                title: 'Could not access contacts',
                description: 'There was an error trying to access your contacts.',
            });
            console.error(ex);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t('promote-your-store')}</CardTitle>
                <CardDescription>
                    {t('share-your-store-with-your-phone-contacts')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleShare} className="w-full">
                    <Share2 className="mr-2 h-4 w-4" />
                    {t('share-with-contacts')}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                    {t('this-will-open-your-phones-contact-picker')}
                </p>
            </CardContent>
        </Card>
    );
}

function UpdateLocationForm({ store, onUpdate }: { store: Store, onUpdate: () => void }) {
    const { firestore } = useFirebase();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();

    const form = useForm<LocationFormValues>({
        resolver: zodResolver(locationSchema),
        defaultValues: {
            latitude: store.latitude || 0,
            longitude: store.longitude || 0,
        },
    });

    const handleGetLocation = () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    form.setValue('latitude', position.coords.latitude);
                    form.setValue('longitude', position.coords.longitude);
                    toast({ title: "Location Fetched!", description: "Your current location has been filled in." });
                },
                () => {
                    toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please enter it manually." });
                }
            );
        } else {
            toast({ variant: 'destructive', title: "Not Supported", description: "Geolocation is not supported by your browser." });
        }
    };
    
    const onSubmit = (data: LocationFormValues) => {
        if (!firestore) return;
        startTransition(async () => {
            const storeRef = doc(firestore, 'stores', store.id);
            try {
                await updateDoc(storeRef, data);
                toast({ title: "Store Location Updated!", description: "Your store's location has been saved." });
                onUpdate();
            } catch (error) {
                const permissionError = new FirestorePermissionError({
                    path: storeRef.path,
                    operation: 'update',
                    requestResourceData: data,
                });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };

    return (
        <Alert variant="destructive">
            <AlertTitle>{t('action-required-update-your-stores-location')}</AlertTitle>
            <AlertDescription>
                {t('your-store-is-missing-gps-coordinates')}
            </AlertDescription>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                    <div className="flex items-end gap-4">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <FormField control={form.control} name="latitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('latitude')}</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="longitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('longitude')}</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                         <Button type="button" variant="outline" onClick={handleGetLocation}>
                            <MapPin className="mr-2 h-4 w-4" /> {t('get-current-location')}
                        </Button>
                    </div>
                     <Button type="submit" disabled={isPending}>
                        {isPending ? t('saving') : t('save-location')}
                    </Button>
                </form>
            </Form>
        </Alert>
    );
}

function DangerZone({ store }: { store: Store }) {
    const { firestore } = useFirebase();
    const [isClosing, startCloseTransition] = useTransition();
    const { toast } = useToast();

    const handleCloseStore = () => {
        if (!firestore) return;

        startCloseTransition(async () => {
            const storeRef = doc(firestore, 'stores', store.id);
            try {
                await updateDoc(storeRef, { isClosed: true });
                toast({
                    title: "Store Closed",
                    description: `${store.name} has been closed and will no longer be visible to customers.`,
                });
            } catch (error) {
                console.error("Failed to close store:", error);
                const permissionError = new FirestorePermissionError({
                    path: storeRef.path,
                    operation: 'update',
                    requestResourceData: { isClosed: true },
                });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };

    return (
        <Card className="border-destructive">
            <CardHeader>
                <CardTitle className="text-destructive">{t('danger-zone')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="font-medium">{t('close-store')}</p>
                        <p className="text-sm text-muted-foreground">
                            {t('this-will-make-your-store-invisible')}
                        </p>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">{t('close-store')}</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>{t('are-you-sure')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                    {t('your-store-and-all-its-products-will-no-longer-be-visible')}
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={handleCloseStore} disabled={isClosing}>
                                    {isClosing ? t('closing') : t('yes-close-my-store')}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}

function StoreDetails({ store, onUpdate }: { store: Store, onUpdate: () => void }) {
    const { firestore } = useFirebase();
    const [isPending, startTransition] = useTransition();
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);

    const form = useForm<Omit<StoreFormValues, 'latitude' | 'longitude'>>({
        resolver: zodResolver(storeSchema.omit({ latitude: true, longitude: true })),
        defaultValues: {
            name: store.name,
            description: store.description,
            address: store.address,
        },
    });
    
    const onSubmit = (data: Omit<StoreFormValues, 'latitude' | 'longitude'>) => {
        if (!firestore) return;

        startTransition(async () => {
            const storeRef = doc(firestore, 'stores', store.id);
            try {
                await updateDoc(storeRef, data);
                toast({ title: "Store Details Updated!", description: "Your store's information has been saved." });
                setIsOpen(false);
                onUpdate(); // Trigger re-fetch in parent if needed
            } catch (error) {
                const permissionError = new FirestorePermissionError({
                    path: storeRef.path,
                    operation: 'update',
                    requestResourceData: data,
                });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle>{t('store-details')}</CardTitle>
                    <Dialog open={isOpen} onOpenChange={setIsOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Edit className="mr-2 h-4 w-4" /> {t('edit')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{t('edit-store-details')}</DialogTitle>
                                <DialogDescription>{t('update-your-stores-public-information')}</DialogDescription>
                            </DialogHeader>
                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('store-name')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} disabled={store.name === 'LocalBasket'} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('description')}</FormLabel>
                                                <FormControl><Textarea {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="address"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('address')}</FormLabel>
                                                <FormControl><Input {...field} /></FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <DialogFooter>
                                        <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>{t('cancel')}</Button>
                                        <Button type="submit" disabled={isPending}>{isPending ? t('saving') : t('save-changes')}</Button>
                                    </DialogFooter>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                <p><strong>{t('description')}:</strong> {store.description}</p>
                <p><strong>{t('address')}:</strong> {store.address}</p>
                <p><strong>{t('location')}:</strong> {store.latitude}, {store.longitude}</p>
            </CardContent>
        </Card>
    );
}

// New component to fetch and display variants for a single product row in the admin table
function AdminProductRow({ product, storeId, onEdit, onDelete }: { product: Product; storeId: string; onEdit: () => void; onDelete: () => void; }) {
    const { firestore } = useFirebase();
    const getProductName = useAppStore(state => state.getProductName);

    const priceDocRef = useMemoFirebase(() => {
        if (!firestore || !product.name) return null;
        return doc(firestore, 'productPrices', product.name.toLowerCase());
    }, [firestore, product.name]);

    const { data: priceData, isLoading: pricesLoading } = useDoc<ProductPrice>(priceDocRef);

    const variantsString = useMemo(() => {
        if (pricesLoading) return "Loading prices...";
        if (!priceData || !priceData.variants || priceData.variants.length === 0) return 'N/A';
        return priceData.variants.map(v => `${v.weight} (₹${v.price})`).join(', ');
    }, [priceData, pricesLoading]);

    return (
        <TableRow>
            <TableCell>
                 <div className="flex items-center gap-4">
                    <Image
                        src={product.imageUrl || 'https://placehold.co/40x40/E2E8F0/64748B?text=?'}
                        alt={product.name}
                        width={40}
                        height={40}
                        className="rounded-sm object-cover"
                    />
                    <span>{getProductName(product)}</span>
                </div>
            </TableCell>
            <TableCell>{t(product.category.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-'))}</TableCell>
            <TableCell>{variantsString}</TableCell>
            <TableCell className="text-right">
                <Button variant="ghost" size="icon" onClick={onEdit}>
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit {product.name}</span>
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete {product.name}</span>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('are-you-sure')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete the master product "{product.name}" and its pricing from the entire platform. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/90">{t('delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </TableCell>
        </TableRow>
    );
}


function ManageStoreView({ store, isAdmin, adminStoreId }: { store: Store; isAdmin: boolean, adminStoreId?: string; }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [isDeleting, startDeleteTransition] = useTransition();
    const [isOpening, startOpenTransition] = useTransition();
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const getProductName = useAppStore(state => state.getProductName);

    const productsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'stores', store.id, 'products'));
    }, [firestore, store.id]);

    const { data: products, isLoading } = useCollection<Product>(productsQuery);
    
    const needsLocationUpdate = !store.latitude || !store.longitude;

    const handleOpenStore = () => {
        if (!firestore) return;
        startOpenTransition(async () => {
             const storeRef = doc(firestore, 'stores', store.id);
             try {
                await updateDoc(storeRef, { isClosed: false });
                toast({
                    title: "Store Re-opened!",
                    description: `${store.name} is now visible to customers again.`,
                });
             } catch (error) {
                console.error("Failed to re-open store:", error);
                const permissionError = new FirestorePermissionError({
                    path: storeRef.path,
                    operation: 'update',
                    requestResourceData: { isClosed: false },
                });
                errorEmitter.emit('permission-error', permissionError);
             }
        });
    };

    if (store.isClosed) {
        return (
            <Alert variant="destructive">
                 <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('this-store-is-closed')}</AlertTitle>
                <AlertDescription>
                    {t('your-store-is-currently-not-visible')}
                </AlertDescription>
                <Button onClick={handleOpenStore} disabled={isOpening} className="mt-4">
                    {isOpening ? t('re-opening') : t('re-open-store')}
                </Button>
            </Alert>
        )
    }

    const handleDeleteProduct = (productId: string, productName: string) => {
        if (!firestore) return;
        
        startDeleteTransition(async () => {
            const batch = writeBatch(firestore);

            // Delete from the master /stores/{adminId}/products collection
            const productRef = doc(firestore, 'stores', store.id, 'products', productId);
            batch.delete(productRef);

            // Also delete from the canonical /productPrices collection
            const priceRef = doc(firestore, 'productPrices', productName.toLowerCase());
            batch.delete(priceRef);

            try {
                await batch.commit();
                toast({
                    title: "Product Deleted",
                    description: `${productName} has been removed from the platform.`,
                });
            } catch (error) {
                 toast({
                    variant: 'destructive',
                    title: "Deletion Failed",
                    description: `Could not delete ${productName}.`,
                });
            }
        });
    };


    return (
      <div className="space-y-8">
        {editingProduct && (
            <EditProductDialog
                storeId={store.id}
                product={editingProduct}
                isOpen={!!editingProduct}
                onOpenChange={(open) => !open && setEditingProduct(null)}
            />
        )}
        {needsLocationUpdate && <UpdateLocationForm store={store} onUpdate={() => {}} />}
        
        <StoreDetails store={store} onUpdate={() => {}} />

        {isAdmin ? (
             <div className="grid md:grid-cols-2 gap-8">
                <BulkUploadCard storeId={store.id} />
                <AddProductForm storeId={store.id} isAdmin={true} />
            </div>
        ) : (
            <>
              <div className="grid md:grid-cols-2 gap-8">
                <StoreImageUploader store={store} />
                {adminStoreId ? (
                    <ProductChecklist storeId={store.id} adminStoreId={adminStoreId} />
                ) : (
                    <Card>
                        <CardHeader><CardTitle>{t('manage-inventory')}</CardTitle></CardHeader>
                        <CardContent>
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>{t('master-store-not-found')}</AlertTitle>
                                <AlertDescription>{t('the-admin-has-not-configured-the-master-product-store')}</AlertDescription>
                            </Alert>
                        </CardContent>
                    </Card>
                )}
             </div>
             <div className="grid md:grid-cols-2 gap-8">
                <PromoteStore store={store} />
             </div>
            </>
        )}

        <Card>
            <CardHeader>
                <CardTitle>{t('your-products')}</CardTitle>
                 <CardDescription>
                    {isAdmin ? t('this-is-the-master-list-of-products') : t('this-is-your-current-store-inventory')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p>{t('loading-products')}...</p>
                ) : products && products.length > 0 ? (
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('product')}</TableHead>
                            <TableHead>{t('category')}</TableHead>
                            {isAdmin && <TableHead>{t('variants')}</TableHead>}
                            {isAdmin && <TableHead className="text-right">{t('actions')}</TableHead>}
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map(product => 
                            isAdmin ? (
                                <AdminProductRow 
                                    key={product.id}
                                    product={product}
                                    storeId={store.id}
                                    onEdit={() => setEditingProduct(product)}
                                    onDelete={() => handleDeleteProduct(product.id, product.name)}
                                />
                            ) : (
                                <TableRow key={product.id}>
                                     <TableCell>
                                        <div className="flex items-center gap-4">
                                            <Image
                                                src={product.imageUrl || 'https://placehold.co/40x40/E2E8F0/64748B?text=?'}
                                                alt={product.name}
                                                width={40}
                                                height={40}
                                                className="rounded-sm object-cover"
                                            />
                                            <span>{getProductName(product)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{t(product.category.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-'))}</TableCell>
                                </TableRow>
                            )
                        )}
                    </TableBody>
                    </Table>
                ) : (
                <p className="text-muted-foreground">{t('you-havent-added-any-products-yet')}</p>
                )}
            </CardContent>
        </Card>
        <DangerZone store={store} />
      </div>
    )
}

function CreateStoreForm({ user, isAdmin, profile, onAutoCreate }: { user: any; isAdmin: boolean; profile?: AppUser | null; onAutoCreate: (coords: { lat: number; lng: number }) => void; }) {
    const { toast } = useToast();
    const [isPending, startTransition] = useTransition();
    const { firestore } = useFirebase();
    const [isLocationConfirmOpen, setIsLocationConfirmOpen] = useState(false);
    const [capturedCoords, setCapturedCoords] = useState<{ lat: number; lng: number } | null>(null);

    const form = useForm<StoreFormValues>({
        resolver: zodResolver(storeSchema),
        defaultValues: {
            name: isAdmin ? 'LocalBasket' : (profile ? `${profile.firstName}'s Store` : ''),
            description: isAdmin ? 'The master store for setting canonical product prices.' : (profile ? `Groceries and goods from ${profile.firstName}'s Store.` : ''),
            address: isAdmin ? 'Platform-wide' : (profile?.address || ''),
            latitude: 0,
            longitude: 0,
        },
    });

    // Auto-create flow
    useEffect(() => {
        if (!isAdmin && profile) {
            handleGetLocation(true); // true indicates it's an auto-flow
        }
    }, [isAdmin, profile]);
    
    const handleGetLocation = (isAuto = false) => {
        if (!navigator.geolocation) {
            toast({ variant: "destructive", title: "Not Supported", description: "Geolocation is not supported by your browser." });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
                if (isAuto) {
                    setCapturedCoords(coords);
                    setIsLocationConfirmOpen(true);
                } else {
                    form.setValue('latitude', coords.lat);
                    form.setValue('longitude', coords.lng);
                    toast({ title: "Location Fetched!", description: "Your current location has been filled in." });
                }
            },
            () => {
                if (isAuto) {
                    toast({ variant: 'destructive', title: "Automatic Creation Failed", description: "Could not retrieve your location. Please create your store manually." });
                } else {
                    toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please enter it manually." });
                }
            }
        );
    };

    const handleConfirmLocation = (confirmed: boolean) => {
        setIsLocationConfirmOpen(false);
        if (confirmed && capturedCoords) {
            onAutoCreate(capturedCoords);
        } else {
            toast({ title: 'Automatic Creation Cancelled', description: 'Please create your store manually from your store location.' });
        }
    };

    const onSubmit = (data: StoreFormValues) => {
        if (!user || !firestore) {
            toast({ variant: 'destructive', title: 'Authentication Error', description: 'You must be logged in.' });
            return;
        }
        if (!isAdmin && (data.latitude === 0 || data.longitude === 0)) {
            toast({ variant: 'destructive', title: 'Location Required', description: 'Please provide your store\'s GPS location.' });
            return;
        }

        startTransition(async () => {
            const storeData = { ...data, ownerId: user.uid, imageId: `store-${Math.floor(Math.random() * 3) + 1}`, isClosed: false };
            try {
                await addDoc(collection(firestore, 'stores'), storeData);
                toast({ title: 'Store Created!', description: `Your store "${data.name}" is now live.` });
            } catch (serverError) {
                const permissionError = new FirestorePermissionError({ path: 'stores', operation: 'create', requestResourceData: storeData });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };

    if (profile && !isAdmin) {
        return (
            <div className="text-center">
                 <AlertDialog open={isLocationConfirmOpen} onOpenChange={setIsLocationConfirmOpen}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{t('confirm-store-location')}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {t('weve-detected-your-location')}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => handleConfirmLocation(false)}>{t('no-ill-do-it-later')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleConfirmLocation(true)}>{t('yes-create-my-store-here')}</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
                <p className="text-lg">{t('attempting-to-create-your-store-automatically')}...</p>
                <Loader2 className="mx-auto mt-4 h-8 w-8 animate-spin" />
                 <p className="text-sm text-muted-foreground mt-4">{t('if-this-fails-you-can-create-your-store-manually')}</p>
            </div>
        );
    }

    return (
        <Card className="max-w-3xl mx-auto">
            <CardHeader>
                <CardTitle className="text-3xl font-headline">{isAdmin ? t('create-master-store') : t('create-your-store')}</CardTitle>
                <CardDescription>
                    {isAdmin ? t('this-is-the-master-store-for-the-platform') : t('fill-out-the-details-to-get-your-shop-listed')}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                        {/* Form Fields... */}
                         <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('store-name')}</FormLabel>
                                <FormControl>
                                <Input placeholder="e.g., Patel Kirana Store" {...field} disabled={isAdmin} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('store-description')}</FormLabel>
                                <FormControl><Textarea placeholder={t('describe-what-makes-your-store-special')} {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="address"
                            render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('full-store-address')}</FormLabel>
                                <FormControl><Input placeholder="123 Market Street, Mumbai" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                            )}
                        />
                         {!isAdmin && (
                            <div className="space-y-2">
                                    <FormLabel>{t('store-location-gps')}</FormLabel>
                                    <div className="flex items-end gap-4">
                                        <div className="grid grid-cols-2 gap-4 flex-1">
                                            <FormField control={form.control} name="latitude" render={({ field }) => (
                                                <FormItem><FormLabel className="text-xs text-muted-foreground">{t('latitude')}</FormLabel><FormControl><Input type="number" placeholder="e.g., 19.0760" {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                            <FormField control={form.control} name="longitude" render={({ field }) => (
                                                <FormItem><FormLabel className="text-xs text-muted-foreground">{t('longitude')}</FormLabel><FormControl><Input type="number" placeholder="e.g., 72.8777" {...field} /></FormControl><FormMessage /></FormItem>
                                            )} />
                                        </div>
                                        <Button type="button" variant="outline" onClick={() => handleGetLocation(false)}>
                                            <MapPin className="mr-2 h-4 w-4" /> {t('get-current-location')}
                                        </Button>
                                    </div>
                            </div>
                            )}
                        <Button type="submit" className="w-full" disabled={isPending || !user}>{isPending ? t('creating') : t('create-store')}</Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}

export default function MyStorePage() {
    const { user, isUserLoading, firestore } = useFirebase();
    const router = useRouter();
    const { toast } = useToast();
    const [isCreating, startCreationTransition] = useTransition();

    const isAdmin = useMemo(() => user?.email === ADMIN_EMAIL, [user]);

    const ownerStoreQuery = useMemoFirebase(() => {
        if (!firestore || !user || isAdmin) return null;
        return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
    }, [firestore, user, isAdmin]);

    const adminStoreQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'stores'), where('name', '==', 'LocalBasket'));
    }, [firestore]);

    const userProfileQuery = useMemoFirebase(() => {
        if (!firestore || !user) return null;
        return doc(firestore, 'users', user.uid);
    }, [firestore, user]);

    const { data: ownerStores, isLoading: isOwnerStoreLoading } = useCollection<Store>(ownerStoreQuery);
    const { data: adminStores, isLoading: isAdminStoreLoading } = useCollection<Store>(adminStoreQuery);
    const { data: userProfile, isLoading: isProfileLoading } = useDoc<AppUser>(userProfileQuery);
    
    const myStore = ownerStores?.[0];
    const adminStore = adminStores?.[0];

    useEffect(() => {
        if (!isUserLoading && !user) {
            router.push('/login?redirectTo=/dashboard/owner/my-store');
        }
    }, [isUserLoading, user, router]);

    const handleAutoCreateStore = (coords: { lat: number; lng: number }) => {
        if (!user || !firestore || !userProfile) {
             toast({ variant: 'destructive', title: 'Error', description: 'User profile not found.' });
             return;
        }

        startCreationTransition(async () => {
             const storeData = {
                name: `${userProfile.firstName}'s Store`,
                description: `Groceries and goods from ${userProfile.firstName}'s Store.`,
                address: userProfile.address,
                latitude: coords.lat,
                longitude: coords.lng,
                ownerId: user.uid,
                imageId: `store-${Math.floor(Math.random() * 3) + 1}`,
                isClosed: false,
            };
            try {
                await addDoc(collection(firestore, 'stores'), storeData);
                toast({ title: 'Store Created!', description: `Your store "${storeData.name}" is now live.` });
            } catch (serverError) {
                const permissionError = new FirestorePermissionError({ path: 'stores', operation: 'create', requestResourceData: storeData });
                errorEmitter.emit('permission-error', permissionError);
            }
        });
    };

    const isLoading = isUserLoading || isOwnerStoreLoading || isAdminStoreLoading || isProfileLoading;

    if (isLoading) {
        return <div className="container mx-auto py-12 px-4 md:px-6">{t('loading-your-store')}...</div>
    }

    const renderContent = () => {
        if (!user) return null;

        if (isAdmin) {
            return adminStore ? <ManageStoreView store={adminStore} isAdmin={true} /> : <CreateStoreForm user={user} isAdmin={true} onAutoCreate={() => {}} />;
        }

        if (myStore) {
            return <ManageStoreView store={myStore} isAdmin={false} adminStoreId={adminStore?.id} />;
        }
        
        // New user without a store
        if (!userProfile) {
            return (
                 <Card className="max-w-3xl mx-auto">
                    <CardHeader>
                        <CardTitle className="text-3xl font-headline">{t('complete-your-profile-first')}</CardTitle>
                        <CardDescription>
                            {t('to-automatically-create-your-store')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                         <Button asChild>
                            <Link href="/dashboard/customer/my-profile">{t('go-to-my-profile')}</Link>
                        </Button>
                    </CardContent>
                </Card>
            )
        }

        return <CreateStoreForm user={user} isAdmin={false} profile={userProfile} onAutoCreate={handleAutoCreateStore} />;
    };
    
    const pageTitleKey = isAdmin
        ? (adminStore ? `Master Catalog: ${adminStore.name}` : 'create-master-store')
        : (myStore ? `Dashboard: ${myStore.name}` : 'create-your-store');
    
    const pageTitle = (myStore || adminStore) ? pageTitleKey : t(pageTitleKey);


    return (
        <div className="container mx-auto py-12 px-4 md:px-6">
            <h1 className="text-4xl font-bold font-headline mb-8">{pageTitle}</h1>
            {renderContent()}
        </div>
    );
}

    