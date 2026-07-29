import { Header } from "../components/Header/Header.jsx";
import { Hero } from "../components/Hero/Hero";
import { Platform } from "../components/Platform/Platform";
import { HowItWorks } from "../components/HowItWorks/HowItWorks";
import { Pricing } from "../components/Pricing/Pricing";
import { Testimonials } from "../components/Testimonials/Testimonials";
import { FaqList } from "../components/FaqList/FaqList";
import { FinalCta } from "../components/FinalCta/FinalCta";
import { Footer } from "../components/Footer/Footer";

export default function HomePage() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Platform />
        <HowItWorks />
        <Pricing />
        <Testimonials />
        <FaqList />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
