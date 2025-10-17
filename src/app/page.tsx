
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getStores } from '@/lib/data';
import { MapPin } from 'lucide-react';
import StoreCard from '@/components/store-card';

export default function Home() {
  const featuredStores = getStores().slice(0, 3);

  return (
    <div className="flex flex-col">
      <section className="w-full py-12 md:py-24 lg:py-32 bg-primary/10">
        <div className="container px-4 md:px-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_600px]">
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline">
                  Shop Fresh, Shop Local with LocalBasket
                </h1>
                <p className="max-w-[600px] text-foreground/80 md:text-xl">
                  Discover the best groceries from your neighborhood stores. We connect you with local vendors for fresh produce, everyday essentials, and more, all delivered to your door.
                </p>
              </div>
              <div className="w-full max-w-sm space-y-2">
                <form className="flex space-x-2">
                  <Input
                    type="text"
                    placeholder="Enter your location or zip code"
                    className="max-w-lg flex-1"
                    aria-label="Location"
                  />
                  <Button type="submit" variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    Find Stores
                  </Button>
                </form>
                <p className="text-xs text-foreground/60">
                  Get groceries from your favorite local stores delivered in minutes.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center">
                <img
                    src="https://picsum.photos/seed/1/600/400"
                    alt="Hero"
                    data-ai-hint="grocery basket"
                    className="mx-auto aspect-video overflow-hidden rounded-xl object-cover sm:w-full lg:order-last lg:aspect-square"
                />
            </div>
          </div>
        </div>
      </section>

      <section className="w-full py-12 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">Featured Local Stores</h2>
              <p className="max-w-[900px] text-foreground/80 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                Explore a curated selection of our top-rated local stores, loved by your community.
              </p>
            </div>
          </div>
          <div className="mx-auto grid grid-cols-1 gap-6 py-12 sm:grid-cols-2 lg:grid-cols-3">
            {featuredStores.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
