
'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
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
import { useToast } from '@/hooks/use-toast';
import type { Store, Product, ProductVariant } from '@/lib/types';
import { useFirebase, useCollection, useMemoFirebase, errorEmitter, FirestorePermissionError, deleteDocumentNonBlocking } from '@/firebase';
import { collection, query, where, addDoc, writeBatch, doc, updateDoc, getDocs } from 'firebase/firestore';
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
import { Share2, MapPin, Trash2, AlertCircle, Upload, Image as ImageIcon, Loader2, Camera, CameraOff, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getProductPrices } from '@/app/dashboard/admin/actions';
import { Progress } from '@/components/ui/progress';
import { generateSingleImage } from '@/ai/flows/image-generator-flow';


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

const productSchema = z.object({
  name: z.string().min(3, 'Product name is required'),
  description: z.string().optional(),
  category: z.string().min(1, "Category is required"),
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
                <CardTitle>Store Image</CardTitle>
                <CardDescription>Take or upload a picture of your storefront.</CardDescription>
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
                            <p className="text-sm">No image set</p>
                        </div>
                    )}
                </div>
                 {/* Hidden canvas for capturing frame */}
                 <canvas ref={canvasRef} style={{ display: 'none' }} />
                 <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />


                {uploading ? (
                    <div className="space-y-2">
                        <Progress value={progress} />
                        <p className="text-xs text-center text-muted-foreground">Uploading... {Math.round(progress)}%</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <Button variant="outline" onClick={handleToggleCamera}>
                            {isCameraOn ? <CameraOff className="mr-2 h-4 w-4" /> : <Camera className="mr-2 h-4 w-4" />}
                            {isCameraOn ? 'Close Camera' : 'Open Camera'}
                        </Button>
                        
                        {isCameraOn && !capturedImage && (
                            <Button onClick={handleCapture}>Capture</Button>
                        )}
                        
                        {!isCameraOn && !capturedImage && (
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" />
                                From Device
                            </Button>
                        )}

                        {capturedImage && (
                             <Button onClick={handleUpload}>
                                <Upload className="mr-2 h-4 w-4" />
                                Upload & Save
                            </Button>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function ProductChecklist({ storeId, adminPrices }: { storeId: string; adminPrices: Record<string, ProductVariant[]> }) {
  const { toast } = useToast();
  const [isAdding, startTransition] = useTransition();
  const { firestore } = useFirebase();
  const [selectedProducts, setSelectedProducts] = useState<Record<string, boolean>>({});

  const handleProductSelection = (productName: string, isChecked: boolean) => {
    setSelectedProducts(prev => ({ 
        ...prev, 
        [productName]: isChecked, 
    }));
  };

  const handleAddSelectedProducts = () => {
    if (!firestore || !storeId) return;

    const productsToAdd = Object.entries(selectedProducts)
                                .filter(([_, isSelected]) => isSelected)
                                .map(([name]) => name);
    
    if (productsToAdd.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No products selected',
        description: 'Please select at least one product to add.',
      });
      return;
    }

    startTransition(async () => {
        const batch = writeBatch(firestore);
        
        for (const name of productsToAdd) {
            const variants = adminPrices[name.toLowerCase()];
            if (!variants || variants.length === 0) {
                toast({
                    variant: 'destructive',
                    title: 'Pricing Not Found',
                    description: `Admin has not set a price for "${name}". Please add it as a custom product or ask an admin to set the price.`,
                });
                continue; // Skip this product
            }

            const imageInfo = await generateSingleImage(name);
            const newProductRef = doc(collection(firestore, 'stores', storeId, 'products'));
            const category = groceryData.categories.find(c => Array.isArray(c.items) && c.items.includes(name))?.categoryName || 'Miscellaneous';
            
            const productData: Omit<Product, 'id'> = {
                name,
                variants,
                description: '',
                storeId,
                imageId: imageInfo?.id || `prod-${createSlug(name)}`,
                imageUrl: imageInfo?.imageUrl || '',
                imageHint: imageInfo?.imageHint || '',
                category,
            };
            
            batch.set(newProductRef, productData);
        }

        try {
            await batch.commit();

            const productsAddedCount = productsToAdd.length;
            if (productsAddedCount > 0) {
                toast({
                    title: `${productsAddedCount} Products Added!`,
                    description: 'The selected products and their prices have been added to your store.',
                });
            }
            setSelectedProducts({});

        } catch (serverError) {
          console.error("Failed to add products in bulk:", serverError);
          const permissionError = new FirestorePermissionError({
            path: `stores/${storeId}/products`,
            operation: 'create',
            requestResourceData: { note: "Bulk product addition failed. See logs for details." },
          });
          errorEmitter.emit('permission-error', permissionError);
        }
    });
  };

  const selectedCount = Object.values(selectedProducts).filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bulk Add Products</CardTitle>
        <CardDescription>Select from a master list. Prices are managed by the admin. Product images will be generated automatically by AI.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Accordion type="multiple" className="w-full">
          {groceryData.categories.map((category) => {
             const categoryItems = category.items && Array.isArray(category.items) ? category.items : [];
            const selectedInCategory = categoryItems.filter(item => selectedProducts[item]).length;

            return (
              <AccordionItem value={category.categoryName} key={category.categoryName}>
                <AccordionTrigger>{category.categoryName} ({selectedInCategory}/{categoryItems.length})</AccordionTrigger>
                <AccordionContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 p-4">
                    {categoryItems.map((item) => (
                      <div key={item} className="flex items-center space-x-2">
                        <Checkbox
                          id={`${category.categoryName}-${item}`}
                          onCheckedChange={(checked) => handleProductSelection(item, !!checked)}
                          checked={selectedProducts[item] || false}
                        />
                        <label
                          htmlFor={`${category.categoryName}-${item}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex-1"
                        >
                          {item}
                        </label>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
        <Button onClick={handleAddSelectedProducts} disabled={isAdding || selectedCount === 0} className="w-full">
            {isAdding ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding Products...
                </>
            ) : (
                `Add ${selectedCount} Selected Products`
            )}
        </Button>
      </CardContent>
    </Card>
  );
}


function AddProductForm({ storeId, adminPrices }: { storeId: string; adminPrices: Record<string, ProductVariant[]> }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { firestore } = useFirebase();

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: '', description: '', category: '' },
  });

  const onSubmit = (data: ProductFormValues) => {
    if (!firestore) return;

    const variants = adminPrices[data.name.toLowerCase()];
    if (!variants || variants.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Pricing Not Set',
            description: `The admin has not set a price for "${data.name}". Please ask an admin to set the price before adding this product.`,
        });
        return;
    }

    startTransition(async () => {
        try {
            const imageInfo = await generateSingleImage(data.name);

            const productData: Omit<Product, 'id'> = {
                ...data,
                storeId,
                variants,
                imageId: imageInfo?.id || `prod-${createSlug(data.name)}`,
                imageUrl: imageInfo?.imageUrl || '',
                imageHint: imageInfo?.imageHint || '',
            };
            
            const productsCol = collection(firestore, 'stores', storeId, 'products');
            
            await addDoc(productsCol, productData);
            
            toast({
                title: 'Product Added!',
                description: `${data.name} has been added with its standard prices and an AI-generated image.`,
            });
            form.reset();

        } catch (serverError) {
            console.error("Failed to create product:", serverError);
            const permissionError = new FirestorePermissionError({
              path: `stores/${storeId}/products`,
              operation: 'create',
              requestResourceData: data,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a Custom Product</CardTitle>
        <CardDescription>Product prices must be set by an admin first. An image will be generated by AI based on the product name.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Organic Apples" {...field} />
                  </FormControl>
                   <FormDescription>Must match the name set by the admin exactly (case-insensitive).</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
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
                  <FormLabel>Product Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Describe the product" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={isPending} className="bg-accent hover:bg-accent/90 text-accent-foreground">
                {isPending ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding Product...
                    </>
                ) : (
                    <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Add Product
                    </>
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
                <CardTitle>Promote Your Store</CardTitle>
                <CardDescription>
                    Share your store with your phone contacts to bring in more customers.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleShare} className="w-full">
                    <Share2 className="mr-2 h-4 w-4" />
                    Share with Contacts
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                    This will open your phone's contact picker. We never see your full contact list.
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
            <AlertTitle>Action Required: Update Your Store's Location</AlertTitle>
            <AlertDescription>
                Your store is missing GPS coordinates. This is required for customers to find you and for delivery services to work. Please update it below.
            </AlertDescription>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                    <div className="flex items-end gap-4">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <FormField control={form.control} name="latitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Latitude</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="longitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Longitude</FormLabel>
                                    <FormControl><Input type="number" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                         <Button type="button" variant="outline" onClick={handleGetLocation}>
                            <MapPin className="mr-2 h-4 w-4" /> Get Current Location
                        </Button>
                    </div>
                     <Button type="submit" disabled={isPending}>
                        {isPending ? "Saving..." : "Save Location"}
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
                    description: `${store.name} has been permanently closed and will no longer be visible to customers.`,
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
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                    <div>
                        <p className="font-medium">Permanently Close Store</p>
                        <p className="text-sm text-muted-foreground">
                            This action cannot be undone. Your store will be removed from all public listings.
                        </p>
                    </div>
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive">Close Store</Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action is permanent. Your store and all its products will no longer be visible to any users. You will not be able to accept any new orders.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleCloseStore} disabled={isClosing}>
                                    {isClosing ? "Closing..." : "Yes, Close My Store"}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardContent>
        </Card>
    );
}


function ManageStoreView({ store, adminPrices }: { store: Store; adminPrices: Record<string, ProductVariant[]> }) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const [isDeleting, startDeleteTransition] = useTransition();


    const productsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return collection(firestore, 'stores', store.id, 'products');
    }, [firestore, store.id]);

    const { data: products, isLoading } = useCollection<Product>(productsQuery);
    
    const needsLocationUpdate = !store.latitude || !store.longitude;

    if (store.isClosed) {
        return (
            <Alert variant="destructive">
                 <AlertCircle className="h-4 w-4" />
                <AlertTitle>Store Permanently Closed</AlertTitle>
                <AlertDescription>
                    This store is closed and is no longer visible to customers. To re-open, please contact support.
                </AlertDescription>
            </Alert>
        )
    }

    const handleDeleteProduct = (productId: string, productName: string) => {
        if (!firestore) return;
        
        startDeleteTransition(async () => {
            const productRef = doc(firestore, 'stores', store.id, 'products', productId);
            try {
                // Using non-blocking delete for better UI experience
                deleteDocumentNonBlocking(productRef);
                
                toast({
                    title: "Product Deleted",
                    description: `${productName} has been removed from your inventory.`,
                });
                // The useCollection hook will automatically update the UI
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
        {needsLocationUpdate && <UpdateLocationForm store={store} onUpdate={() => {}} />}
        <div className="grid md:grid-cols-2 gap-8">
            <StoreImageUploader store={store} />
            <Card>
                <CardHeader>
                    <CardTitle>Manage {store.name}</CardTitle>
                    <CardDescription>
                        View your existing inventory below and add new products.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                   <AddProductForm storeId={store.id} adminPrices={adminPrices} />
                </CardContent>
            </Card>
        </div>
         <div className="grid md:grid-cols-2 gap-8">
            <ProductChecklist storeId={store.id} adminPrices={adminPrices} />
            <PromoteStore store={store} />
        </div>
        <Card>
            <CardHeader>
                <CardTitle>Your Products</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <p>Loading products...</p>
                ) : products && products.length > 0 ? (
                    <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Variants</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {products.map(product => (
                            <TableRow key={product.id}>
                                <TableCell>{product.name}</TableCell>
                                <TableCell>{product.variants?.map(v => `${v.weight} (₹${v.price})`).join(', ') || 'N/A'}</TableCell>
                                <TableCell>{product.category}</TableCell>
                                <TableCell className="text-right">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleDeleteProduct(product.id, product.name)}
                                        disabled={isDeleting}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">Delete {product.name}</span>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                    </Table>
                ) : (
                <p className="text-muted-foreground">You haven't added any products yet.</p>
                )}
            </CardContent>
        </Card>
        <DangerZone store={store} />
      </div>
    )
}

function CreateStoreForm({ user }: { user: any; }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const { firestore } = useFirebase();
  
  const form = useForm<StoreFormValues>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: '',
      description: '',
      address: '',
      latitude: 0,
      longitude: 0,
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
                 toast({ variant: 'destructive', title: "Location Error", description: "Could not retrieve your location. Please enable permissions and try again." });
            }
        );
    } else {
        toast({ variant: 'destructive', title: "Not Supported", description: "Geolocation is not supported by your browser." });
    }
  };


  const onSubmit = (data: StoreFormValues) => {
    if (!user || !firestore) {
        toast({
            variant: 'destructive',
            title: 'Authentication Error',
            description: 'You must be logged in to create a store.',
        });
        return;
    }
     if (data.latitude === 0 || data.longitude === 0) {
        toast({
            variant: 'destructive',
            title: 'Location Required',
            description: 'Please provide your store\'s location using the GPS button or by entering it manually.',
        });
        return;
    }

    startTransition(async () => {
        const storeData = {
            ...data,
            ownerId: user.uid,
            imageId: `store-${Math.floor(Math.random() * 3) + 1}`,
            isClosed: false,
        };
        const storesCol = collection(firestore, 'stores');
        
        try {
            await addDoc(storesCol, storeData);
            toast({
                title: 'Store Created!',
                description: `Your store "${data.name}" has been successfully created. You can now add products.`,
            });
        } catch (serverError) {
            console.error("Failed to create store:", serverError);
            const permissionError = new FirestorePermissionError({
                path: 'stores',
                operation: 'create',
                requestResourceData: storeData,
            });
            errorEmitter.emit('permission-error', permissionError);
        }
    });
  };

  return (
      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-3xl font-headline">
            Create Your Store
          </CardTitle>
          <CardDescription>
            Fill out the details below to get your shop listed on LocalBasket. Once created, you can add products to your inventory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Store Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Patel Kirana Store"
                        {...field}
                      />
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
                    <FormLabel>Store Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe what makes your store special."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Store Address</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="123 Market Street, Mumbai"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
               <div className="space-y-2">
                    <FormLabel>Store Location (GPS)</FormLabel>
                    <div className="flex items-end gap-4">
                        <div className="grid grid-cols-2 gap-4 flex-1">
                            <FormField control={form.control} name="latitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">Latitude</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g., 19.0760" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="longitude" render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs text-muted-foreground">Longitude</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g., 72.8777" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>
                        <Button type="button" variant="outline" onClick={handleGetLocation}>
                            <MapPin className="mr-2 h-4 w-4" /> Get Current Location
                        </Button>
                    </div>
               </div>

              <Button
                type="submit"
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
                disabled={isPending || !user}
              >
                {isPending ? 'Creating...' : 'Create Store'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
  );
}


export default function MyStorePage() {
  const { user, isUserLoading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login?redirectTo=/dashboard/owner/my-store');
    }
  }, [isUserLoading, user, router]);

  const { firestore } = useFirebase();
  const storeQuery = useMemoFirebase(() => {
      if (!firestore || !user) return null;
      return query(collection(firestore, 'stores'), where('ownerId', '==', user.uid));
  }, [firestore, user]);

  const { data: stores, isLoading: isStoreLoading } = useCollection<Store>(storeQuery);
  const myStore = stores?.[0];

  const [adminPrices, setAdminPrices] = useState<Record<string, ProductVariant[]>>({});
  const [pricesLoading, setPricesLoading] = useState(true);

  useEffect(() => {
    async function fetchAdminPrices() {
      setPricesLoading(true);
      const priceMap = await getProductPrices();
      setAdminPrices(priceMap);
      setPricesLoading(false);
    }
    fetchAdminPrices();
  }, []);

  if (isUserLoading || isStoreLoading || pricesLoading) {
    return <div className="container mx-auto py-12 px-4 md:px-6">Loading your store...</div>
  }
  
  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <h1 className="text-4xl font-bold font-headline mb-8">
        {myStore ? `Dashboard: ${myStore.name}` : 'Create Your Store'}
      </h1>

      {myStore ? (
        <ManageStoreView store={myStore} adminPrices={adminPrices} />
      ) : (
        <CreateStoreForm user={user} />
      )}
    </div>
  );
}
