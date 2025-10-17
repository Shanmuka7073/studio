
import { getStore, getProducts, getStoreImage } from '@/lib/data';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import ProductCard from '@/components/product-card';

export default function StoreDetailPage({ params }: { params: { id: string } }) {
  const store = getStore(params.id);
  
  if (!store) {
    notFound();
  }

  const products = getProducts(store.id);
  const image = getStoreImage(store.imageId);

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
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
          <h1 className="text-4xl font-bold font-headline mb-2">{store.name}</h1>
          <p className="text-lg text-muted-foreground mb-2">{store.address}</p>
          <p className="text-lg">{store.description}</p>
        </div>
      </div>

      <h2 className="text-3xl font-bold font-headline mb-8">Products</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
