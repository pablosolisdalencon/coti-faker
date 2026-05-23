const fs = require("fs");
const path = require("path");
const { createQuotation, formatQuotationText, findMaterialPrice, validateRut } = require("./skills/quotation_generator/generator");

console.log("=== PILOT TEST: QUOTATION GENERATOR SKILL ===");

// 1. Test RUT validator (Bypassed as per user requirement)
console.log("Testing RUT Validation (Always true):");
const r1 = "77.141.881-3";
console.log(`RUT ${r1}:`, validateRut(r1) ? "VALID" : "INVALID");

// 2. Test Material Finder
console.log("\nTesting Material Finder:");
const mat = findMaterialPrice("cemento");
if (mat) {
  console.log(`Found material: ${mat.name} | Price: ${mat.price_clp} CLP | Unit: ${mat.unit}`);
} else {
  console.log("Material not found.");
}

// 3. Test Quotation Generation (from Tarea 1009 reference)
console.log("\nGenerating test quotation (Ppta 1009 conversion):");
const mockInput = {
  numero: 1217,
  emisor: {
    razon_social: "Servicios de Mantenimiento Industrial Páez SpA",
    giro: "Comercializadora de insumos de aseo, gasfiteria y reparaciones en gral",
    direccion: "Carlos Ditborn 0702 , Ñuñoa , XIII Metropolitana de Santiago",
    fono: "+56 9 4239 5271",
    email: "primeservice.chile@gmail.com",
    rut: "77.141.881-3"
  },
  receptor: {
    razon_social: "CONDOMINIO ANDES lll",
    rut: "65.108.391-5",
    direccion: "AV ESCUELA AGRICOLA 1710",
    comuna: "Macul"
  },
  fecha_emision: "2026-05-11",
  fecha_vencimiento: "2026-06-11",
  detalles: [
    {
      item: 1,
      descripcion_resumen: "Fabricación e instalación de cierre metálico galvanizado sector bicicletas",
      descripcion_detallada: "Fabricación e instalación de cierre perimetral metálico de seguridad para sector de bicicletas, desarrollado con estructura reforzada en perfiles de acero, malla galvanizada de alta resistencia y puerta de acceso con sistema de cierre. El trabajo considera fabricación a medida, anclajes mecánicos al radier existente, soldaduras, refuerzos estructurales, nivelación, montaje y terminaciones, con el objetivo de entregar un espacio más seguro y protegido para el resguardo de bicicletas y pertenencias de residentes.",
      cantidad: 1,
      unidad: "UNID",
      precio_unitario: 2800000,
      impuesto: "AF"
    }
  ],
  observaciones: [
    "50% de anticipo para inicio de trabajos.",
    "50% contra entrega de trabajos terminados.",
    "Trabajo incluye fabricación e instalación completa.",
    "Tiempo estimado de ejecución: 4 a 6 días hábiles."
  ]
};

const cot = createQuotation(mockInput);
console.log("Calculated Totales:");
console.log("Neto:  ", cot.totales.monto_neto);
console.log("IVA:   ", cot.totales.iva_19);
console.log("Total: ", cot.totales.monto_total);

// Formatting text output
console.log("\nFormatting Text Document Output:");
const textDoc = formatQuotationText(cot);
console.log("----------------------------------------");
console.log(textDoc);
console.log("----------------------------------------");

// Verify calculations
const expectedIva = Math.round(2800000 * 0.19);
const expectedTotal = 2800000 + expectedIva;
if (cot.totales.iva_19 === expectedIva && cot.totales.monto_total === expectedTotal) {
  console.log("✅ Pilot test calculations verified successfully.");
} else {
  console.error("❌ ERROR: Calculations do not match expected values!");
}
