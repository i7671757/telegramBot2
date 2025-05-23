import * as fs from 'fs';

console.log('Reading sessions.json file...');
const sessionsData = JSON.parse(fs.readFileSync('sessions.json', 'utf8'));

console.log('Found sessions file with:', {
  sessions: sessionsData.sessions?.length || 0,
  hasCategories: Boolean(sessionsData.categories)
});

// Process each session
if (sessionsData.sessions && sessionsData.sessions.length > 0) {
  console.log('Processing sessions...');
  let removedCategoriesCount = 0;

  sessionsData.sessions.forEach(session => {
    if (session.data && session.data.categories) {
      console.log(`Processing session ${session.id}, found categories array with ${session.data.categories.length} items`);
      
      // Remove the categories array if it exists
      delete session.data.categories;
      removedCategoriesCount++;
    }
  });

  console.log(`Removed categories array from ${removedCategoriesCount} sessions`);
  
  // Also check if there's a categories array at the root level
  if (sessionsData.categories) {
    delete sessionsData.categories;
    console.log('Removed categories array from root level');
  }

  // Write the cleaned data back to the file
  fs.writeFileSync('sessions.json', JSON.stringify(sessionsData, null, 2));
  console.log('Successfully saved cleaned sessions file');
} else {
  console.log('No sessions found to process');
} 