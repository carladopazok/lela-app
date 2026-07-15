'use client'

import { useState } from 'react'
import Sidebar, { type SectionId } from '@/components/layout/Sidebar'
import { DummyDataProvider } from '@/lib/dummy-data-context'
import LateShipments from '@/components/sections/LateShipments'
import SalesOverview from '@/components/sections/SalesOverview'
import ProductsInventory from '@/components/sections/ProductsInventory'
import EmailPerformance from '@/components/sections/EmailPerformance'
import CustomerIntelligence from '@/components/sections/CustomerIntelligence'
import CustomerJourney from '@/components/sections/CustomerJourney'
import CustomerService from '@/components/sections/CustomerService'
import Forecast from '@/components/sections/Forecast'
import AboutTool from '@/components/sections/AboutTool'

export default function Home() {
  const [active, setActive] = useState<SectionId>('sales-overview')
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)
  const [openReplyBody, setOpenReplyBody] = useState<string | null>(null)
  const [openCustomerEmail, setOpenCustomerEmail] = useState<string | null>(null)
  const [openProductId, setOpenProductId] = useState<number | null>(null)
  const [productsFilter, setProductsFilter] = useState<'soldout' | 'stalled' | null>(null)
  const [productsSort, setProductsSort] = useState<'bestselling' | null>(null)

  // Tracks whether the current tab was reached via a "See in detail"-style link from Sales
  // Overview, so that tab can offer a way back. Cleared on any other navigation (sidebar click
  // or a cross-nav from a different section) so the back link doesn't linger somewhere it
  // no longer makes sense.
  const [cameFromSalesOverview, setCameFromSalesOverview] = useState(false)

  function goToSection(id: SectionId, fromSalesOverview = false) {
    setCameFromSalesOverview(fromSalesOverview)
    setActive(id)
  }

  function goToTicket(ticketId: string, replyBody?: string) {
    setOpenTicketId(ticketId)
    setOpenReplyBody(replyBody ?? null)
    goToSection('customer-service')
  }

  function goToCustomer(email: string) {
    setOpenCustomerEmail(email)
    goToSection('customer-intelligence')
  }

  function goToProduct(productId: number) {
    setOpenProductId(productId)
    goToSection('products-inventory')
  }

  function goToProductsFiltered(filter: 'soldout' | 'stalled') {
    setProductsFilter(filter)
    goToSection('products-inventory', true)
  }

  function goToBestSellers() {
    setProductsSort('bestselling')
    goToSection('products-inventory', true)
  }

  function goBackToSalesOverview() {
    goToSection('sales-overview')
  }

  return (
    <DummyDataProvider>
      <div className="flex min-h-screen bg-cream-100">
        <Sidebar active={active} onSelect={(id) => goToSection(id)} />

        <main className="flex-1 ml-60 min-h-screen">
          <div className="max-w-7xl mx-auto px-10 py-12">
            {active === 'sales-overview'        && (
              <SalesOverview
                onGoToLateShipments={() => goToSection('late-shipments', true)}
                onGoToProductsFiltered={goToProductsFiltered}
                onGoToBestSellers={goToBestSellers}
              />
            )}
            {active === 'late-shipments'        && (
              <LateShipments
                onBackToSalesOverview={cameFromSalesOverview ? goBackToSalesOverview : undefined}
                onNavigateToTicket={goToTicket}
              />
            )}
            {active === 'products-inventory'    && (
              <ProductsInventory
                openProductId={openProductId}
                onOpenProductHandled={() => setOpenProductId(null)}
                initialFilter={productsFilter}
                onInitialFilterHandled={() => setProductsFilter(null)}
                initialSort={productsSort}
                onInitialSortHandled={() => setProductsSort(null)}
                onBackToSalesOverview={cameFromSalesOverview ? goBackToSalesOverview : undefined}
              />
            )}
            {active === 'email-performance'     && <EmailPerformance />}
            {active === 'customer-intelligence' && (
              <CustomerIntelligence
                openCustomerEmail={openCustomerEmail}
                onOpenCustomerHandled={() => setOpenCustomerEmail(null)}
                onNavigateToTicket={goToTicket}
                onNavigateToProduct={goToProduct}
              />
            )}
            {active === 'customer-journey' && <CustomerJourney />}
            {active === 'customer-service' && (
              <CustomerService
                openTicketId={openTicketId}
                onOpenTicketHandled={() => setOpenTicketId(null)}
                openReplyBody={openReplyBody}
                onOpenReplyBodyHandled={() => setOpenReplyBody(null)}
                onNavigateToCustomer={goToCustomer}
                onBackToSalesOverview={cameFromSalesOverview ? goBackToSalesOverview : undefined}
              />
            )}
            {active === 'forecast'              && <Forecast />}
            {active === 'about'                 && <AboutTool />}
          </div>
        </main>
      </div>
    </DummyDataProvider>
  )
}
