import { Footer } from "@/components/footer/footer";
import { Navbar } from "@/components/header/navbar";
import { FeaturesSection } from "@/components/home/features-section";
import { HeroSection } from "@/components/home/hero-section";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <HeroSection />
        <FeaturesSection />
      </main>

      <Footer />
    </>
  );
}
