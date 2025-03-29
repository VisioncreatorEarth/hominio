import { seedRandomDoc } from './index';

console.log('🌱 Seeding database...');

seedRandomDoc()
    .then((doc) => {
        console.log('✅ Successfully created doc:', doc.id);
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }); 