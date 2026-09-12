import { Footer } from "@/components/footer/footer";
import { Navbar } from "@/components/header/navbar";
import { CTASection } from "@/components/home/cta-section";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";
import { ProductShowcase } from "@/components/home/product-showcase";
import { SecuritySection } from "@/components/home/security-section";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <HeroSection />
        <FeaturesSection />
        <ProductShowcase />
        <SecuritySection />
        <CTASection />
      </main>

      <Footer />
    </>
  );
}
