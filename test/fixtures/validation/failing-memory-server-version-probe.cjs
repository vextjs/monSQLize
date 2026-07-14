const version = process.argv[2] || '';

if (version.startsWith('7.')) {
    console.log(`OK ${version}`);
    process.exit(0);
}

console.error(`fixture startup failure for ${version}`);
process.exit(2);
