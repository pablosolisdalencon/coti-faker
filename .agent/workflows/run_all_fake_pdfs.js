const fs = require('fs');
const path = require('path');
const { generateFakePdfForCompany } = require('./make_fake_pdf');

// Directories
const tareasDir = path.resolve(__dirname, '../../tareas');
const resultadosDir = path.resolve(__dirname, '../../resultados');
const empresasDir = path.resolve(__dirname, '../../empresas');

// Ensure resultados directory exists
if (!fs.existsSync(resultadosDir)) {
  fs.mkdirSync(resultadosDir, { recursive: true });
}

// Load company profiles
const dfsProfilePath = path.join(empresasDir, 'dfs_maderas_spa.json');
const jysProfilePath = path.join(empresasDir, 'jys_arquitectura_construccion_spa.json');
const dfsProfile = JSON.parse(fs.readFileSync(dfsProfilePath, 'utf8'));
const jysProfile = JSON.parse(fs.readFileSync(jysProfilePath, 'utf8'));

// Helper to process a single PDF for a given company
async function processPdf(pdfPath) {
  const baseName = path.basename(pdfPath, '.pdf');
  
  // Map provided JSON keys to the ones expected by the workflow
  const mapProfile = (profile, themeLayout, primary, secondary, accent, logo) => ({
    razon_social: profile.Razon || profile.razon_social || '',
    rut: profile.Rut || profile.rut || '',
    direccion: profile.Direccion || profile.direccion || '',
    contacto: {
      nombre: profile.Contacto || (profile.contacto ? profile.contacto.nombre : '') || '',
    },
    fono: profile.Fono || profile.fono || '',
    themeLayout,
    primaryColor: primary,
    secondaryColor: secondary,
    accentColor: accent,
    logoPath: logo ? path.join(empresasDir, logo) : null,
    condiciones_del_servicio: profile.condiciones_del_servicio || null
  });

  const dfsMapped = mapProfile(dfsProfile, 'accent', '#2d3748', '#4a5568', '#f6b216', 'logo_dfs.png');
  const jysMapped = mapProfile(jysProfile, 'minimalist', '#000000', '#000000', '#000000', 'logo_jys.png');


  // Generate for DFS Maderas SPA
  await generateFakePdfForCompany(pdfPath, dfsMapped, 'DFS_Maderas_SPA', resultadosDir);
  // Generate for JyS Arquitectura y Construcción SPA
  await generateFakePdfForCompany(pdfPath, jysMapped, 'JyS_Arquitectura_Construccion_SPA', resultadosDir);
}

async function main() {
  const files = fs.readdirSync(tareasDir);
  const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
  for (const pdfFile of pdfFiles) {
    const pdfPath = path.join(tareasDir, pdfFile);
    console.log(`Processing ${pdfFile}...`);
    await processPdf(pdfPath);
  }
  console.log('All fake PDFs generated in', resultadosDir);
}

main().catch(err => {
  console.error('Error during processing:', err);
  process.exit(1);
});
