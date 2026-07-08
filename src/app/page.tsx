'use client'

import { useState } from 'react'
import Sidebar, { type SectionId } from '@/components/layout/Sidebar'
import LateShipments from '@/components/sections/LateShipments'
import SalesOverview from '@/components/sections/SalesOverview'
import EmailPerformance from '@/components/sections/EmailPerformance'
import CustomerIntelligence from '@/components/sections/CustomerIntelligence'
import CustomerService from '@/components/sections/CustomerService'
import AboutTool from '@/components/sections/AboutTool'

export default function Home() {
  const [active, setActive] = useState<SectionId>('sales-overview')

  return (
    <div className="flex min-h-screen bg-cream-100">
      <Sidebar active={active} onSelect={setActive} />

      <main className="flex-1 ml-60 min-h-screen">
        <div className="max-w-5xl mx-auto px-10 py-12">
          {active === 'sales-overview'        && <SalesOverview />}
          {active === 'late-shipments'        && <LateShipments />}
          {active === 'email-performance'     && <EmailPerformance />}
          {active === 'customer-intelligence' && <CustomerIntelligence />}
          {active === 'customer-service'      && <CustomerService />}
          {active === 'about'                 && <AboutTool />}
        </div>
      </main>
    </div>
  )
}
