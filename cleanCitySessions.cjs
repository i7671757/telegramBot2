const fs = require('fs');

console.log('Starting city and branch sessions cleanup...');

try {
  // Read the sessions file
  const sessionsData = JSON.parse(fs.readFileSync('sessions.json', 'utf8'));
  
  // Process each session
  if (sessionsData.sessions && sessionsData.sessions.length > 0) {
    console.log('Processing sessions...');
    let updatedSessionsCount = 0;

    sessionsData.sessions.forEach(session => {
      if (session.data) {
        let sessionUpdated = false;
        
        // Convert selectedCity object to ID if it's an object
        if (session.data.selectedCity && typeof session.data.selectedCity === 'object' && session.data.selectedCity.id) {
          const cityId = session.data.selectedCity.id;
          session.data.selectedCity = cityId;
          console.log(`Converted selectedCity object to ID: ${cityId} for session ${session.id}`);
          sessionUpdated = true;
        }
        
        // Convert selectedBranch object to ID if it's an object
        if (session.data.selectedBranch && typeof session.data.selectedBranch === 'object' && session.data.selectedBranch.id) {
          const branchId = session.data.selectedBranch.id;
          session.data.selectedBranch = branchId;
          console.log(`Converted selectedBranch object to ID: ${branchId} for session ${session.id}`);
          sessionUpdated = true;
        }
        
        // Remove cities array if it exists
        if (session.data.cities && Array.isArray(session.data.cities)) {
          delete session.data.cities;
          console.log(`Removed cities array from session ${session.id}`);
          sessionUpdated = true;
        }
        
        // Remove terminals array if it exists (temporary data)
        if (session.data.terminals && Array.isArray(session.data.terminals)) {
          delete session.data.terminals;
          console.log(`Removed terminals array from session ${session.id}`);
          sessionUpdated = true;
        }
        
        if (sessionUpdated) {
          updatedSessionsCount++;
        }
      }
    });

    console.log(`Updated ${updatedSessionsCount} sessions`);
    
    // Write the cleaned data back to the file
    fs.writeFileSync('sessions.json', JSON.stringify(sessionsData, null, 2));
    console.log('Successfully saved cleaned sessions file');
  } else {
    console.log('No sessions found to process');
  }
} catch (error) {
  console.error('Error cleaning sessions:', error);
}

console.log('City and branch sessions cleanup completed'); 