export type Language = 'id' | 'en';

export interface LocalizedText {
  id: string;
  en: string;
}

export function pickText(text: LocalizedText, lang: Language): string {
  return text[lang];
}

export function formatDecimal(
  val: number,
  digits: number,
  lang: Language,
): string {
  const fixed = val.toFixed(digits);
  return lang === 'id' ? fixed.replace('.', ',') : fixed;
}

export function formatInteger(val: number, lang: Language): string {
  return Math.round(val).toLocaleString(lang === 'id' ? 'id-ID' : 'en-US');
}

export function formatDuration(hours: number, lang: Language): string {
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (lang === 'id') {
    if (h === 0) return `${m} mnt`;
    if (m === 0) return `${h} jam`;
    return `${h} jam ${m} mnt`;
  }
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function formatCurrency(amount: number, lang: Language): string {
  const formatted = formatInteger(amount, lang);
  return lang === 'id' ? `Rp ${formatted}` : `IDR ${formatted}`;
}

export interface UiCopy {
  pageTitle: string;
  header: {
    pumpType: string;
    pipeSpec: string;
    engineSpec: string;
    langSwitchAria: string;
    langSwitchTitle: string;
  };
  telemetry: {
    ariaLabel: string;
    engineSpeed: string;
    dischargeFlow: string;
    engineLoad: string;
    fuelRate: string;
    shaftTorque: string;
    flowUnitM3h: string;
    fuelUnitLph: string;
  };
  cavitation: {
    safe: string;
    warning: string;
    critical: string;
    headLabel: string;
  };
  hotspot: {
    inspectPrefix: string;
    panelAria: string;
    closeAria: string;
  };
  bom: {
    ariaLabel: string;
    title: string;
    subtitle: string;
    closeAria: string;
    qtyLabel: string;
    footerHint: string;
  };
  calculator: {
    ariaLabel: string;
    title: string;
    subtitlePrefix: string;
    subtitleSuffix: string;
    closeAria: string;
    areaLabel: string;
    unitHa: string;
    unitM2: string;
    depthLabel: string;
    pumpUnitsLabel: string;
    fuelPriceLabel: string;
    volumeLabel: string;
    combinedFlowLabel: string;
    unitWord: string;
    noFlowWarning: string;
    durationLabel: string;
    totalFuelLabel: string;
    totalCostLabel: string;
    refillsLabel: string;
    refillsSuffix: string;
    costPerM3Label: string;
    footerHint: string;
  };
  dock: {
    showControls: string;
    hideControls: string;
    toggleTitle: string;
    throttleLabel: string;
    throttleAria: string;
    rpmOff: string;
    canalLabel: string;
    canalAria: string;
    canalPresets: {
      dry: string;
      vortex: string;
      normal: string;
      flood: string;
    };
    explodedLabel: string;
    explodedAria: string;
    xray: string;
    waterFlow: string;
    hose: string;
    hoseTitle: string;
    cadDims: string;
    cadDimsTitle: string;
    beltGuard: string;
    beltGuardTitle: string;
    calculator: string;
    calculatorTitle: string;
    bom: string;
    bomTitle: string;
    pins: string;
    pinsTitle: string;
    audioMute: string;
    audioOn: string;
    audioUnmuteAria: string;
    audioMuteAria: string;
    stageAria: string;
    stages: {
      tanggul: string;
      studio: string;
      field: string;
    };
    timeAria: string;
    times: {
      day: string;
      dusk: string;
      night: string;
    };
    nightLampTitle: string;
    orbitHint: string;
    shortcutHint: string;
  };
  viewport: {
    ariaLabel: string;
    webglUnavailable: string;
    contextPaused: string;
    contextLostMsg: string;
    initFallbackMsg: string;
    reloadButton: string;
  };
}

export const UI_COPY: Record<Language, UiCopy> = {
  id: {
    pageTitle: 'Dongfeng ZH1130 · Pompa Aksial PVC 12"',
    header: {
      pumpType: 'Pompa Aksial PVC AW 12"',
      pipeSpec: '1m + 5m (18°)',
      engineSpec: 'Diesel 30 HP',
      langSwitchAria: 'Pilih bahasa tampilan',
      langSwitchTitle: 'Ganti bahasa ID / EN (Tekan L)',
    },
    telemetry: {
      ariaLabel: 'Telemetri Operasional Pompa',
      engineSpeed: 'Putaran Mesin',
      dischargeFlow: 'Debit Aliran',
      engineLoad: 'Beban Mesin',
      fuelRate: 'Konsumsi Solar',
      shaftTorque: 'Torsi Poros',
      flowUnitM3h: 'm³/jam',
      fuelUnitLph: 'L/jam',
    },
    cavitation: {
      safe: 'Submergensi Aman',
      warning: 'Awas Vortex — Debit Turun',
      critical: 'Kritis: Masuk Angin — Turunkan RPM',
      headLabel: 'Head',
    },
    hotspot: {
      inspectPrefix: 'Periksa',
      panelAria: 'Spesifikasi Teknis Komponen',
      closeAria: 'Tutup spesifikasi komponen',
    },
    bom: {
      ariaLabel: 'Daftar Part Bill of Materials',
      title: 'DAFTAR PART (BOM)',
      subtitle: 'Dongfeng ZH1130 + Pompa Aksial 12" · 22 Item',
      closeAria: 'Tutup Daftar Part',
      qtyLabel: 'Jml',
      footerHint: 'Klik item untuk fokus kamera 3D',
    },
    calculator: {
      ariaLabel: 'Kalkulator Kuras Banjir dan Biaya Solar',
      title: 'KALKULATOR BANJIR & SOLAR',
      subtitlePrefix: 'Sinkron RPM',
      subtitleSuffix: '& debit aktual',
      closeAria: 'Tutup Kalkulator',
      areaLabel: 'Luas Genangan',
      unitHa: 'Hektar',
      unitM2: 'm²',
      depthLabel: 'Tinggi Air (cm)',
      pumpUnitsLabel: 'Jumlah Pompa',
      fuelPriceLabel: 'Harga Solar (Rp/L)',
      volumeLabel: 'Volume Air',
      combinedFlowLabel: 'Debit Gabungan',
      unitWord: 'unit',
      noFlowWarning:
        'Debit nol. Naikkan RPM, aktifkan Aliran Air, atau naikkan muka air kanal di atas batas surut kritis.',
      durationLabel: 'Estimasi Durasi Kuras',
      totalFuelLabel: 'Kebutuhan Solar',
      totalCostLabel: 'Estimasi Biaya BBM',
      refillsLabel: 'Isi Ulang Tangki (14 L)',
      refillsSuffix: 'isi',
      costPerM3Label: 'Biaya per m³ Air',
      footerHint: 'Geser RPM / Air Kanal untuk simulasi',
    },
    dock: {
      showControls: 'Tampilkan Kontrol',
      hideControls: 'Sembunyikan Kontrol',
      toggleTitle: 'Tampilkan atau sembunyikan kontrol (H)',
      throttleLabel: 'Gas',
      throttleAria: 'Pengatur RPM Mesin',
      rpmOff: 'Mati',
      canalLabel: 'Air Kanal',
      canalAria: 'Elevasi Muka Air Kanal',
      canalPresets: {
        dry: 'Surut',
        vortex: 'Vortex',
        normal: 'Normal',
        flood: 'Banjir',
      },
      explodedLabel: 'Bongkar',
      explodedAria: 'Persentase Tampilan Bongkar',
      xray: 'X-Ray',
      waterFlow: 'Aliran Air',
      hose: 'Selang',
      hoseTitle: 'Pasang atau lepas selang buang spiral',
      cadDims: 'Dimensi CAD',
      cadDimsTitle: 'Garis ukuran CAD 3D (D)',
      beltGuard: 'Pelindung Belt',
      beltGuardTitle: 'Pelindung K3 V-Belt (G)',
      calculator: 'Kalkulator',
      calculatorTitle: 'Kalkulator Banjir & Solar (K)',
      bom: 'Daftar Part',
      bomTitle: 'Daftar Part BOM (B)',
      pins: 'Pin',
      pinsTitle: 'Pin info komponen',
      audioMute: 'Senyap',
      audioOn: 'Suara',
      audioUnmuteAria: 'Nyalakan suara mesin diesel dan air',
      audioMuteAria: 'Matikan suara',
      stageAria: 'Mode Lokasi',
      stages: {
        tanggul: 'Tanggul',
        studio: 'Studio',
        field: 'Lapangan',
      },
      timeAria: 'Waktu dan Pencahayaan',
      times: {
        day: 'Siang',
        dusk: 'Sore',
        night: 'Malam',
      },
      nightLampTitle: 'Mode Malam dengan lampu sorot kerja LED',
      orbitHint: 'Seret: putar · Gulir: zoom · Klik kanan: geser',
      shortcutHint:
        'H Kontrol · X X-Ray · D Dimensi · G Pelindung Belt · K Kalkulator · B BOM · L ID/EN',
    },
    viewport: {
      ariaLabel:
        'Model 3D mesin diesel Dongfeng ZH1130 dan pompa aksial PVC 12 inci',
      webglUnavailable: 'WebGL Tidak Tersedia',
      contextPaused: 'Konteks 3D Dijeda',
      contextLostMsg:
        'Konteks grafis terputus sementara. Muat ulang halaman untuk memulihkan tampilan 3D.',
      initFallbackMsg: 'Gagal menginisialisasi konteks WebGL 3D.',
      reloadButton: 'Muat Ulang',
    },
  },
  en: {
    pageTitle: 'Dongfeng ZH1130 · 12" Axial Flow Pump',
    header: {
      pumpType: '12" PVC AW Axial Pump',
      pipeSpec: '1m + 5m (18°)',
      engineSpec: '30 HP Diesel',
      langSwitchAria: 'Select display language',
      langSwitchTitle: 'Switch language ID / EN (Press L)',
    },
    telemetry: {
      ariaLabel: 'Live Pump Telemetry',
      engineSpeed: 'Engine Speed',
      dischargeFlow: 'Discharge Flow',
      engineLoad: 'Engine Load',
      fuelRate: 'Fuel Rate',
      shaftTorque: 'Shaft Torque',
      flowUnitM3h: 'm³/hr',
      fuelUnitLph: 'L/hr',
    },
    cavitation: {
      safe: 'Safe Submergence',
      warning: 'Vortex Risk — Flow Drop',
      critical: 'Critical: Air-Lock — Reduce RPM',
      headLabel: 'Head',
    },
    hotspot: {
      inspectPrefix: 'Inspect',
      panelAria: 'Component Technical Specification',
      closeAria: 'Close component specification',
    },
    bom: {
      ariaLabel: 'Bill of Materials Parts List',
      title: 'PARTS LIST (BOM)',
      subtitle: 'Dongfeng ZH1130 + 12" Axial Pump · 22 Items',
      closeAria: 'Close Parts List',
      qtyLabel: 'Qty',
      footerHint: 'Click any item to focus 3D camera',
    },
    calculator: {
      ariaLabel: 'Flood Drainage and Fuel Cost Calculator',
      title: 'FLOOD & FUEL CALCULATOR',
      subtitlePrefix: 'Live RPM',
      subtitleSuffix: '& actual flow',
      closeAria: 'Close Calculator',
      areaLabel: 'Flood Area',
      unitHa: 'Hectare',
      unitM2: 'm²',
      depthLabel: 'Water Depth (cm)',
      pumpUnitsLabel: 'Pump Units',
      fuelPriceLabel: 'Diesel Price (IDR/L)',
      volumeLabel: 'Water Volume',
      combinedFlowLabel: 'Combined Flow',
      unitWord: 'units',
      noFlowWarning:
        'Zero discharge. Raise RPM, enable Water Flow, or lift canal water above critical drawdown.',
      durationLabel: 'Est. Drain Time',
      totalFuelLabel: 'Total Diesel',
      totalCostLabel: 'Est. Fuel Cost',
      refillsLabel: 'Tank Refills (14 L)',
      refillsSuffix: 'fills',
      costPerM3Label: 'Cost per m³',
      footerHint: 'Adjust Throttle / Canal Level to simulate',
    },
    dock: {
      showControls: 'Show Controls',
      hideControls: 'Hide Controls',
      toggleTitle: 'Toggle controls (H)',
      throttleLabel: 'Throttle',
      throttleAria: 'Engine Throttle RPM',
      rpmOff: 'Off',
      canalLabel: 'Canal Level',
      canalAria: 'Canal Water Elevation',
      canalPresets: {
        dry: 'Low',
        vortex: 'Vortex',
        normal: 'Normal',
        flood: 'Flood',
      },
      explodedLabel: 'Exploded',
      explodedAria: 'Exploded View Percentage',
      xray: 'X-Ray',
      waterFlow: 'Water Flow',
      hose: 'Hose',
      hoseTitle: 'Attach or detach spiral discharge hose',
      cadDims: 'CAD Dims',
      cadDimsTitle: '3D CAD dimension lines (D)',
      beltGuard: 'Belt Guard',
      beltGuardTitle: 'V-Belt safety guard (G)',
      calculator: 'Calculator',
      calculatorTitle: 'Flood & Fuel Calculator (K)',
      bom: 'Parts (BOM)',
      bomTitle: 'Parts List BOM (B)',
      pins: 'Pins',
      pinsTitle: 'Component info pins',
      audioMute: 'Mute',
      audioOn: 'Audio',
      audioUnmuteAria: 'Unmute diesel engine and water audio',
      audioMuteAria: 'Mute audio',
      stageAria: 'Stage Environment',
      stages: {
        tanggul: 'Levee',
        studio: 'Studio',
        field: 'Field',
      },
      timeAria: 'Time of Day Lighting',
      times: {
        day: 'Day',
        dusk: 'Dusk',
        night: 'Night',
      },
      nightLampTitle: 'Night mode with LED work floodlights',
      orbitHint: 'Drag: orbit · Scroll: zoom · Right-drag: pan',
      shortcutHint:
        'H Controls · X X-Ray · D CAD Dims · G Belt Guard · K Calculator · B BOM · L ID/EN',
    },
    viewport: {
      ariaLabel:
        '3D model of Dongfeng ZH1130 diesel engine and 12-inch PVC axial flow pump',
      webglUnavailable: 'WebGL Unavailable',
      contextPaused: '3D Context Paused',
      contextLostMsg:
        'Graphics context interrupted. Reload the page to restore the 3D viewport.',
      initFallbackMsg: 'Failed to initialize WebGL 3D context.',
      reloadButton: 'Reload',
    },
  },
};
