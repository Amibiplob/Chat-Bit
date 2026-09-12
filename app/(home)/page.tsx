import { Footer } from "@/components/footer/footer";
import { Navbar } from "@/components/header/navbar";
import { HeroSection } from "@/components/home/hero-section";

export default function HomePage() {
  return (
    <>
      <Navbar />

      <main>
        <HeroSection />
      </main>

      <Footer />
    </>
  );
}
