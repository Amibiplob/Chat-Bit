import { Footer } from "@/components/footer/footer";
import { Navbar } from "@/components/header/navbar";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { ProductShowcase } from "@/components/home/product-showcase";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <HeroSection />
        <FeaturesSection />
        <ProductShowcase />
      </main>

      <Footer />
    </>
  );
}
