import { getStores } from '@/lib/data';
import StoreCard from '@/components/store-card';

export default function StoresPage() {
  const stores = getStores();

  return (
    <div className="container mx-auto py-12 px-4 md:px-6">
      <div className="space-y-4 mb-8">
        <h1 className="text-4xl font-bold font-headline">Browse All Stores</h1>
        <p className="text-muted-foreground text-lg">Find your new favorite local grocery store.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {stores.map((store) => (
          <StoreCard key={store.id} store={store} />
        ))}
      </div>
    </div>
  );
}
