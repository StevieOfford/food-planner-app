import React, { useState, useEffect } from 'react';

// Helper function to fetch a dish image from the AI with robust retries and error handling
const fetchDishImage = async (dishName: string, retries: number = 5, delay: number = 2000): Promise<string | null> => {
  const prompt = `A delicious, high-quality, professional food photograph of ${dishName}, presented beautifully on a plate, suitable for a recipe card. Focus on the food, with a clean background.`;
  const payload = { instances: { prompt: prompt }, parameters: { "sampleCount": 1 } };
  // API Key for Imagen API calls - inserted by AI
  const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      // Check if the response itself was successful (HTTP 2xx status)
      if (!response.ok) {
        // Log only if it's the last attempt and it failed
        if (i === retries - 1) {
          let errorText = await response.text();
          console.error(`Final attempt failed for ${dishName}: HTTP Status ${response.status}. Response: ${errorText}. This indicates a persistent API key authentication issue for imagen-3.0-generate-002.`);
          throw new Error(`Image generation failed after ${retries} attempts: HTTP Status ${response.status} - ${errorText.substring(0, 200)}...`);
        }
        // For intermediate failures, just retry without logging
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      // Try to parse the response as JSON
      let result;
      let responseText = '';
      try {
        responseText = await response.text(); // Read as text first
        result = JSON.parse(responseText); // Then parse as JSON
      } catch (parseError) {
        if (i === retries - 1) {
          console.error(`Final attempt failed for ${dishName}: JSON parse error. Raw response: ${responseText}. Error: ${parseError}.`);
          throw new Error(`Image generation failed after ${retries} attempts: Invalid JSON response. Raw: ${responseText.substring(0, 200)}...`);
        }
        await new Promise(res => setTimeout(res, delay));
        continue;
      }

      // Check if the parsed result contains the expected image data
      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        return `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
      } else {
        if (i === retries - 1) {
          console.warn(`Final attempt for ${dishName}: No image data (bytesBase64Encoded) found in valid JSON response. Result:`, result);
          throw new Error('No image data received from AI after all attempts, even with valid JSON.');
        }
        await new Promise(res => setTimeout(res, delay));
        continue;
      }
    } catch (err) {
      // This catches network errors or errors thrown by previous `throw new Error` statements
      if (i === retries - 1) {
        console.error(`Final unhandled error on attempt ${i + 1} for ${dishName}:`, err);
        throw err; // Re-throw the error if all retries fail
      }
      await new Promise(res => setTimeout(res, delay));
      continue;
    }
  }
  throw new Error('Failed to fetch image after all retries.'); // Fallback if loop finishes without success
};


// Main App component
const App = () => {
  // State variables for user inputs for meal plan generation
  const [dietaryPreferences, setDietaryPreferences] = useState<string>('');
  const [allergies, setAllergies] = useState<string>('');
  const [specificRequirements, setSpecificRequirements] = useState<string>('');

  // Define a type for a single meal plan day
  interface MealPlanDay {
    day: string;
    meals: {
      dinner: string;
    };
    people: number;
    imageUrl: string | null;
    imageLoading: boolean;
  }
  const [mealPlan, setMealPlan] = useState<MealPlanDay[] | null>(null); // Stores the generated 7-day dinner plan
  const [loading, setLoading] = useState<boolean>(false); // Loading state for initial meal plan generation
  const [error, setError] = useState<string>(''); // Error message state for initial meal plan generation

  // State variables for displaying meal details (ingredients/instructions)
  const [showRecipeModal, setShowRecipeModal] = useState<boolean>(false); // Controls recipe modal visibility
  const [selectedDinner, setSelectedDinner] = useState<string>(''); // Stores the name of the dinner clicked

  // Define a type for meal details (recipe)
  interface MealDetails {
    ingredients: string[];
    instructions: string;
    calories: string;
    newMealName?: string; // Optional, as it's only returned by customizeRecipe
  }
  const [mealDetails, setMealDetails] = useState<MealDetails | null>(null); // Stores ingredients, instructions, and calories for recipe
  const [loadingMealDetails, setLoadingMealDetails] = useState<boolean>(false); // Loading state for meal details
  const [mealDetailsError, setMealDetailsError] = useState<string>(''); // Error message for meal details

  // State for recipe customization within the modal
  const [customServings, setCustomServings] = useState<number>(1); // For adjusting servings in recipe modal
  const [substitutionRequest, setSubstitutionRequest] = useState<string>(''); // For substitution text input
  const [customizingRecipe, setCustomizingRecipe] = useState<boolean>(false); // Loading state for recipe customization
  const [customizationError, setCustomizationError] = useState<string>(''); // Error for recipe customization
  const [currentRecipeDayIndex, setCurrentRecipeDayIndex] = useState<number | null>(null); // Stores the index of the day whose recipe is open

  // State for tracking loading status of individual day regeneration
  const [regeneratingDay, setRegeneratingDay] = useState<string | null>(null); // Stores the day being regenerated

  // State variables for shopping list
  const [showShoppingListModal, setShowShoppingListModal] = useState<boolean>(false); // Controls shopping list modal visibility
  const [shoppingList, setShoppingList] = useState<{[key: string]: string[]} | null>(null); // Stores the generated shopping list (categorized object)
  const [loadingShoppingList, setLoadingShoppingList] = useState<boolean>(false); // Loading state for shopping list
  const [shoppingListError, setShoppingListError] = useState<string>(''); // Error message for shopping list
  const [shoppingListExportSuccessMessage, setShoppingListExportSuccessMessage] = useState<string>(''); // Success message for shopping list export
  const [shoppingListExportError, setShoppingListExportError] = useState<string>(''); // Error message for shopping list export


  // State for tracking which day's meal title is being edited
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null);
  const [editedMealTitle, setEditedMealTitle] = useState<string>('');

  // State for export functionality (for meal plan)
  const [exportingMealPlan, setExportingMealPlan] = useState<boolean>(false);
  const [exportError, setExportError] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string>(''); // Suppress warning

  // State for import functionality (for meal plan)
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [importText, setImportText] = useState<string>('');
  const [importError, setImportError] = useState<string>('');
  const [importSuccessMessage, setImportSuccessMessage] = useState<string>('');

  // NEW STATE FOR LIMITED FACILITIES
  const [useLimitedFacilities, setUseLimitedFacilities] = useState<boolean>(false); // Checkbox state
  const [showFacilitiesModal, setShowFacilitiesModal] = useState<boolean>(false); // Modal visibility
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]); // Array of selected facilities

  // List of available cooking facilities
  const availableFacilities: string[] = [
    'Oven', 'Hob', 'Microwave', 'Toaster', 'Grill', 'Kettle', 'Steamer',
    'Slow Cooker', 'Air Fryer', 'Blender', 'Pressure Cooker'
  ];


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const daysOfWeek: string[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]; // Suppress warning

  // UseEffect to dynamically load Tailwind CSS and Inter font
  useEffect(() => {
    // Tailwind CSS CDN is now loaded in public/index.html

    // Load Inter Font
    const interLink = document.createElement('link');
    interLink.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
    interLink.rel = "stylesheet";
    document.head.appendChild(interLink);

    // Apply Inter font to body
    document.body.style.fontFamily = "'Inter', sans-serif";

    // Clean up on component unmount (optional for single page apps, but good practice)
    return () => {
      // Removed tailwindScript cleanup as it's now loaded statically
      if (document.head.contains(interLink)) {
        document.head.removeChild(interLink);
      }
      document.body.style.fontFamily = ''; // Reset font family
    };
  }, []); // Empty dependency array means this runs once on mount


  /**
   * Helper function to clean up meal titles by removing bracketed info or units.
   * @param {string} title - The raw meal title string.
   * @returns {string} The cleaned meal title.
   */
  const cleanMealTitle = (title: string): string => {
    // Remove anything in parentheses, e.g., "Chicken Stir-fry (with Brown Rice)" -> "Chicken Stir-fry"
    let cleaned = title.replace(/\s*\(.*?\)\s*/g, '');
    // Remove common unit indicators if they appear at the end, e.g., "Steak 200g" -> "Steak"
    cleaned = cleaned.replace(/\s*\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|cup|cups|tbsp|tsp|pieces|slices|units|servings)\b/gi, '');
    // Trim any leading/trailing whitespace that might result from replacements
    return cleaned.trim();
  };

  /**
   * Client-side function to parse a markdown-formatted shopping list string into categories and items.
   * Expected format:
   * ## Category 1
   * - Item 1
   * - Item 2
   * ## Category 2
   * - Item A
   * @param {string} markdownList - The shopping list string in markdown format.
   * @returns {Object.<string, string[]>} An object with categories as keys and item arrays as values.
   */
  const parseShoppingListMarkdown = (markdownList: string): {[key: string]: string[]} => {
    // Step 1: Clean up the raw markdown string
    // Remove leading/trailing quotes and common AI-added format indicators like "markdown"
    let cleanedList = markdownList.trim();
    if (cleanedList.startsWith('```json') && cleanedList.endsWith('```')) {
        cleanedList = cleanedList.substring(7, cleanedList.length - 3).trim();
    }
    if (cleanedList.startsWith('```') && cleanedList.endsWith('```')) {
        cleanedList = cleanedList.substring(3, cleanedList.length - 3).trim();
    }
    if (cleanedList.startsWith('"') && cleanedList.endsWith('"')) {
        cleanedList = cleanedList.substring(1, cleanedList.length - 1).trim();
    }
    cleanedList = cleanedList.replace(/^"markdown\n/, '').replace(/\nmarkdown"$/, '').trim(); // Specific fix for ""markdown\n"
    cleanedList = cleanedList.replace(/^markdown\n/, '').trim(); // Also handle just "markdown\n"

    const categorized: {[key: string]: string[]} = {};
    const lines = cleanedList.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    let currentCategory = 'Miscellaneous'; // Default category

    lines.forEach(line => {
      if (line.startsWith('## ')) {
        // This is a category heading
        currentCategory = line.substring(3).trim();
        categorized[currentCategory] = categorized[currentCategory] || [];
      } else if (line.startsWith('- ')) {
        // This is a list item (now expected to include quantity)
        const item = line.substring(2).trim();
        categorized[currentCategory] = categorized[currentCategory] || []; // Ensure category exists
        categorized[currentCategory].push(item); // Store the item as is, including quantity
      } else {
        // If it doesn't match a category or list item, put it in the current category or miscellaneous
        categorized[currentCategory] = categorized[currentCategory] || [];
        categorized[currentCategory].push(line);
      }
    });

    // Clean up empty categories if they were created but never populated
    for (const key in categorized) {
      if (categorized[key].length === 0) {
        delete categorized[key];
      }
    }

    return categorized;
  };


  /**
   * Handles the generation of the 7-day dinner plan using the AI backend.
   */
  const generateMealPlan = async () => {
    // If limited facilities checkbox is checked, open the modal first
    if (useLimitedFacilities) {
      setShowFacilitiesModal(true);
      return; // Stop here, the actual generation will happen after facilities are selected
    }

    // If not using limited facilities, proceed directly
    proceedGenerateMealPlan();
  };

  /**
   * Fetches images for all meals in the meal plan.
   * This runs after the initial text meal plan is generated.
   * @param {MealPlanDay[]} currentMealPlan - The meal plan array to fetch images for.
   */
  const fetchImagesForMealPlan = async (currentMealPlan: MealPlanDay[]) => {
    const updatedPlanPromises = currentMealPlan.map(async (dayPlan, index) => {
      if (dayPlan.meals.dinner.trim() === '') {
        // No meal, no image needed
        return { ...dayPlan, imageLoading: false, imageUrl: null };
      }

      // Update state to show loading for this specific image
      setMealPlan(prev => {
        if (!prev) return null;
        const newPrev = [...prev];
        newPrev[index] = { ...newPrev[index], imageLoading: true, imageUrl: null };
        return newPrev;
      });

      try {
        const imageUrl = await fetchDishImage(dayPlan.meals.dinner);
        // Update state with the fetched image
        setMealPlan(prev => {
          if (!prev) return null;
          const newPrev = [...prev];
          newPrev[index] = { ...newPrev[index], imageUrl: imageUrl, imageLoading: false };
          return newPrev;
        });
        return { ...dayPlan, imageUrl: imageUrl, imageLoading: false };
      } catch (err) {
        console.error(`Failed to load image for ${dayPlan.meals.dinner}:`, err);
        // Update state to show error/placeholder for this image
        setMealPlan(prev => {
          if (!prev) return null;
          const newPrev = [...prev];
          newPrev[index] = { ...newPrev[index], imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error', imageLoading: false };
          return newPrev;
        });
        return { ...dayPlan, imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error', imageLoading: false };
      }
    });

    // Wait for all image fetches to settle (either fulfilled or rejected)
    await Promise.allSettled(updatedPlanPromises);
  };


  /**
   * Proceeds with the actual meal plan generation after facilities are selected (or if not using limited facilities).
   */
  const proceedGenerateMealPlan = async () => {
    setLoading(true);
    setError('');
    setMealPlan(null); // Clear previous meal plan
    setShowFacilitiesModal(false); // Close facilities modal if it was open

    try {
      // Construct the prompt for the AI model for the 7-day dinner plan
      let prompt = `Generate a 7-day dinner meal plan.
        Dietary Preferences: ${dietaryPreferences || 'None'}
        Allergies: ${allergies || 'None'}
        Specific Requirements: ${specificRequirements || 'None'}`;

      // Add cooking facilities limitation if applicable
      if (useLimitedFacilities && selectedFacilities.length > 0) {
        prompt += `\nCooking Facilities Available: ${selectedFacilities.join(', ')}. Please suggest meals that can be prepared using ONLY these facilities.`;
      } else if (useLimitedFacilities && selectedFacilities.length === 0) {
        // Handle case where limited facilities is checked but none are selected
        setError('Please select at least one cooking facility or uncheck "Limited Cooking Facilities".');
        setLoading(false);
        return;
      }

      prompt += `
        Please provide the meal plan in a JSON array format, where each object represents a day.
        Each day object should have a 'day' property (e.g., "Monday") and a 'meals' object.
        THe 'meals' object should contain only a 'dinner' property with a string value for the meal.
        Example format:
        [
          {
            "day": "Monday",
            "meals": {
              "dinner": "Salmon with roasted vegetables"
            }
          },
          // ... for 7 days
        ]
      `;

      // Prepare the payload for the Gemini API call for the meal plan
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                "day": { "type": "STRING" },
                "meals": {
                  "type": "OBJECT",
                  "properties": {
                    "dinner": { "type": "STRING" }
                  },
                  "required": ["dinner"]
                }
              },
              "required": ["day", "meals"]
            }
          }
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedPlan: MealPlanDay[] = JSON.parse(jsonString);

        if (Array.isArray(parsedPlan) && parsedPlan.length === 7) {
          // Add 'people' property and initialize image-related properties
          const planWithInitialProps = parsedPlan.map(day => ({
            ...day,
            people: 1,
            imageUrl: null, // Initialize image URL as null
            imageLoading: false // Initialize image loading state
          }));
          setMealPlan(planWithInitialProps);

          // Immediately trigger image fetching in the background
          fetchImagesForMealPlan(planWithInitialProps);

        } else {
          setError('Failed to generate a valid 7-day dinner plan. Please try again.');
          console.error("Invalid meal plan structure received:", parsedPlan);
        }
      } else {
        setError('No meal plan content received from the AI. Please try again.');
        console.error("Unexpected API response structure:", result);
      }
    } catch (err: any) { // Type 'any' for err in catch block
      console.error("Error generating meal plan:", err);
      setError(`Failed to generate meal plan: ${err.message}. Please check your input and try again.`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Updates the number of people for a specific day in the meal plan.
   * @param {number} index - The index of the day in the mealPlan array.
   * @param {number} newPeopleCount - The new number of people.
   */
  const handlePeopleChange = (index: number, newPeopleCount: number) => {
    setMealPlan(prevMealPlan => {
      if (!prevMealPlan) return null; // Ensure prevMealPlan is not null
      const updatedPlan = [...prevMealPlan];
      updatedPlan[index] = {
        ...updatedPlan[index],
        people: newPeopleCount
      };
      return updatedPlan;
    });
  };

  /**
   * Initiates editing for a specific meal title.
   * @param {number} index - The index of the day in the mealPlan array.
   * @param {string} currentTitle - The current meal title to pre-fill the input.
   */
  const startEditingMeal = (index: number, currentTitle: string) => {
    setEditingMealIndex(index);
    setEditedMealTitle(currentTitle);
  };

  /**
   * Saves the manually edited meal title.
   * @param {number} index - The index of the day in the mealPlan array.
   */
  const saveEditedMeal = async (index: number) => {
    setMealPlan(prevMealPlan => {
      if (!prevMealPlan) return null; // Ensure prevMealPlan is not null
      const updatedPlan = [...prevMealPlan];
      updatedPlan[index] = {
        ...updatedPlan[index],
        meals: {
          dinner: editedMealTitle // Use the manually edited title
        },
        imageUrl: null, // Clear image as meal changed
        imageLoading: true // Start loading new image
      };
      return updatedPlan;
    });
    setEditingMealIndex(null); // Exit editing mode
    setEditedMealTitle(''); // Clear edited title state

    // Fetch new image for the edited meal
    try {
      const newImageUrl = await fetchDishImage(editedMealTitle);
      setMealPlan(prevMealPlan => {
        if (!prevMealPlan) return null;
        const updatedPlan = [...prevMealPlan];
        updatedPlan[index] = {
          ...updatedPlan[index],
          imageUrl: newImageUrl,
          imageLoading: false
        };
        return updatedPlan;
      });
    } catch (err) {
      console.error("Error fetching image for edited meal:", err);
      setMealPlan(prevMealPlan => {
        if (!prevMealPlan) return null;
        const updatedPlan = [...prevMealPlan];
        updatedPlan[index] = {
          ...updatedPlan[index],
          imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error',
          imageLoading: false
        };
        return updatedPlan;
      });
    }
  };

  /**
   * Cancels meal title editing.
   */
  const cancelEditingMeal = () => {
    setEditingMealIndex(null);
    setEditedMealTitle('');
  };

  /**
   * Clears the meal (dinner title) and resets people count for a specific day.
   * @param {number} index - The index of the day in the mealPlan array.
   */
  const clearMealForDay = (index: number) => {
    setMealPlan(prevMealPlan => {
      if (!prevMealPlan) return null; // Ensure prevMealPlan is not null
      const updatedPlan = [...prevMealPlan];
      updatedPlan[index] = {
        ...updatedPlan[index],
        meals: {
          dinner: '' // Clear the dinner title
        },
        people: 1, // Reset people count to default
        imageUrl: null, // Clear image
        imageLoading: false // No image loading needed
      };
      return updatedPlan;
    });
  };

  /**
   * Handles toggling of cooking facilities checkboxes in the modal.
   * @param {string} facility - The name of the facility to toggle.
   */
  const handleFacilityToggle = (facility: string) => {
    setSelectedFacilities(prev =>
      prev.includes(facility)
        ? prev.filter(f => f !== facility)
        : [...prev, facility]
    );
  };

  /**
   * Fetches ingredients, instructions, and calories for a specific dinner using AI.
   * This function is also used for initial recipe display.
   * @param {string} dinnerName - The name of the dinner meal.
   * @param {number} peopleCount - The number of people for this meal.
   * @param {number} dayIndex - The index of the day in the mealPlan array.
   */
  const fetchMealDetails = async (dinnerName: string, peopleCount: number, dayIndex: number) => {
    setSelectedDinner(cleanMealTitle(dinnerName));
    setMealDetails(null); // Clear previous details
    setLoadingMealDetails(true);
    setMealDetailsError('');
    setCustomServings(peopleCount); // Initialize custom servings with current people count
    setSubstitutionRequest(''); // Clear any previous substitution request
    setCurrentRecipeDayIndex(dayIndex); // Store the day index
    setShowRecipeModal(true); // Open the recipe modal immediately

    try {
      // Prompt for AI: use the raw dinner name and people count for accuracy in recipe generation
      const prompt = `Provide the ingredients list, cooking instructions, and an estimated calorie count per serving for '${dinnerName}' for ${peopleCount} people.
        Format as a JSON object with three keys:
        'ingredients' (an array of strings, each string being one ingredient item, e.g., ["2 chicken breasts", "1 cup rice"])
        'instructions' (a single string containing all cooking steps, clearly numbered or bulleted).
        'calories' (a string representing the estimated calorie count per serving, e.g., "450 kcal" or "Approx. 300-350 calories").`;

      // Prepare the payload for the Gemini API call for meal details
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "ingredients": {
                "type": "ARRAY",
                "items": { "type": "STRING" }
              },
              "instructions": { "type": "STRING" },
              "calories": { "type": "STRING" } // New property for calories
            },
            "required": ["ingredients", "instructions", "calories"] // Calories is now required
          }
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedDetails: MealDetails = JSON.parse(jsonString);

        if (parsedDetails.ingredients && Array.isArray(parsedDetails.ingredients) &&
            typeof parsedDetails.instructions === 'string' &&
            typeof parsedDetails.calories === 'string') { // Check for calories
          setMealDetails(parsedDetails);
        } else {
          setMealDetailsError('Failed to parse meal details. Please try again.');
          console.error("Invalid meal details structure received:", parsedDetails);
        }
      } else {
        setMealDetailsError('No meal details content received from the AI. Please try again.');
        console.error("Unexpected API response structure for meal details:", result);
      }
    } catch (err: any) {
      console.error("Error fetching meal details:", err);
      setMealDetailsError(`Failed to get recipe: ${err.message}.`);
    } finally {
      setLoadingMealDetails(false);
    }
  };

  /**
   * Customizes the current recipe based on new servings or substitution requests.
   * This function also updates the main mealPlan state.
   * @param {string} originalDinnerName - The original name of the dinner meal for the prompt.
   */
  const customizeRecipe = async (originalDinnerName: string) => {
    setCustomizingRecipe(true);
    setCustomizationError('');
    setMealDetails(null); // Clear current details while customizing

    try {
      let prompt = `Update the recipe for '${originalDinnerName}'`;

      if (customServings > 0) { // Always include servings in the prompt for clarity
        prompt += ` for ${customServings} people`;
      } else {
        setCustomizationError("Please enter a valid number of servings (greater than 0).");
        setCustomizingRecipe(false);
        return;
      }

      if (substitutionRequest.trim() !== '') {
        prompt += ` with the following changes: ${substitutionRequest.trim()}.`;
      }

      prompt += `
        Provide the updated ingredients list, cooking instructions, and an estimated calorie count per serving.
        Format as a JSON object with three keys:
        'ingredients' (an array of strings, each string being one ingredient item, e.g., ["2 chicken breasts", "1 cup rice"])
        'instructions' (a single string containing all cooking steps, clearly numbered or bulleted).
        'calories' (a string representing the estimated calorie count per serving, e.g., "450 kcal" or "Approx. 300-350 calories").
        'newMealName' (a string representing the potentially updated meal name after customization, e.g., "Tofu Stir-fry" if chicken was replaced). If the name doesn't change significantly, keep the original name.
        `;

      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              "ingredients": { "type": "ARRAY", "items": { "type": "STRING" } },
              "instructions": { "type": "STRING" },
              "calories": { "type": "STRING" },
              "newMealName": { "type": "STRING" } // Expecting new meal name
            },
            "required": ["ingredients", "instructions", "calories", "newMealName"]
          }
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const jsonString = result.candidates[0].content.parts[0].text;
        const parsedDetails: MealDetails = JSON.parse(jsonString);

        // Validate the structure of the parsed response
        if (parsedDetails.ingredients && Array.isArray(parsedDetails.ingredients) &&
            typeof parsedDetails.instructions === 'string' &&
            typeof parsedDetails.calories === 'string' &&
            typeof parsedDetails.newMealName === 'string') {

          setMealDetails(parsedDetails); // Update modal display
          setSelectedDinner(cleanMealTitle(parsedDetails.newMealName)); // Update modal title to new name

          // IMPORTANT: Update the mealPlan state to reflect the customization
          setMealPlan(prevMealPlan => {
            if (currentRecipeDayIndex !== null && prevMealPlan) {
              const updatedPlan = [...prevMealPlan];
              // Fix: Use non-null assertion for currentRecipeDayIndex
              updatedPlan[currentRecipeDayIndex!] = {
                ...updatedPlan[currentRecipeDayIndex!],
                meals: {
                  // Fix: Use nullish coalescing to ensure it's a string, falling back to original name
                  dinner: parsedDetails.newMealName ?? originalDinnerName
                },
                people: customServings, // Use the customized servings
                imageUrl: null, // Clear image as meal changed, will regenerate below
                imageLoading: true // Start loading new image
              };
              return updatedPlan;
            }
            return prevMealPlan;
          });

          // Fetch new image for the customized meal
          try {
            const newImageUrl = await fetchDishImage(parsedDetails.newMealName ?? originalDinnerName); // Use fallback here too
            setMealPlan(prevMealPlan => {
              if (!prevMealPlan) return null;
              const updatedPlan = [...prevMealPlan];
              // Fix: Use non-null assertion for currentRecipeDayIndex
              updatedPlan[currentRecipeDayIndex!] = {
                ...updatedPlan[currentRecipeDayIndex!],
                imageUrl: newImageUrl,
                imageLoading: false
              };
              return updatedPlan;
            });
          } catch (imgErr) {
            console.error("Error fetching image for customized meal:", imgErr);
            setMealPlan(prevMealPlan => {
              if (!prevMealPlan) return null;
              const updatedPlan = [...prevMealPlan];
              // Fix: Use non-null assertion for currentRecipeDayIndex
              updatedPlan[currentRecipeDayIndex!] = {
                ...updatedPlan[currentRecipeDayIndex!],
                imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error',
                imageLoading: false
              };
              return updatedPlan;
            });
          }


        } else {
          setCustomizationError('Failed to parse updated recipe details. The AI response was not in the expected format. Please try again.');
          console.error("Invalid customized recipe structure received:", parsedDetails);
        }
      } else {
        setCustomizationError('No updated recipe content received from the AI. Please try again.');
        console.error("Unexpected API response structure for customization:", result);
      }
    } catch (err: any) {
      console.error("Error customizing recipe:", err);
      setCustomizationError(`Failed to customize recipe: ${err.message}. Please try again.`);
    } finally {
      setCustomizingRecipe(false);
    }
  };


  /**
   * Closes the recipe details modal and clears its content.
   */
  const closeRecipeModal = () => {
    setShowRecipeModal(false);
    setSelectedDinner('');
    setMealDetails(null);
    setMealDetailsError('');
    setCustomServings(1); // Reset custom servings
    setSubstitutionRequest(''); // Reset substitution request
    setCustomizationError(''); // Clear customization error
    setCurrentRecipeDayIndex(null); // Clear the stored day index
  };

  /**
   * Regenerates the dinner for a specific day.
   * @param {string} dayToRegenerate - The day of the week to regenerate (e.g., "Monday").
   * @param {number} index - The index of the day in the mealPlan array.
   * @param {number} peopleCount - The number of people for this day.
   */
  const regenerateDinnerForDay = async (dayToRegenerate: string, index: number, peopleCount: number) => {
    setRegeneratingDay(dayToRegenerate); // Set the day being regenerated
    setError(''); // Clear any previous errors from meal plan generation
    setMealDetailsError(''); // Clear any previous errors from meal details

    // Set image loading true for this specific card
    setMealPlan(prev => {
      if (!prev) return null;
      const newPrev = [...prev];
      newPrev[index] = { ...newPrev[index], imageLoading: true, imageUrl: null };
      return newPrev;
    });

    try {
      // Construct the prompt for the AI model to regenerate a single dinner
      let prompt = `Generate a dinner meal for ${dayToRegenerate} for ${peopleCount} people.
        Dietary Preferences: ${dietaryPreferences || 'None'}
        Allergies: ${allergies || 'None'}
        Specific Requirements: ${specificRequirements || 'None'}`;

      // Add cooking facilities limitation if applicable for regeneration
      if (useLimitedFacilities && selectedFacilities.length > 0) {
        prompt += `\nCooking Facilities Available: ${selectedFacilities.join(', ')}. Please suggest a meal that can be prepared using ONLY these facilities.`;
      } else if (useLimitedFacilities && selectedFacilities.length === 0) {
        setError('Please select at least one cooking facility or uncheck "Limited Cooking Facilities" to regenerate.');
        setRegeneratingDay(null);
        // Reset image loading for this card if error
        setMealPlan(prev => {
            if (!prev) return null;
            const newPrev = [...prev];
            newPrev[index] = { ...newPrev[index], imageLoading: false, imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Error' };
            return newPrev;
        });
        return;
      }

      prompt += `
        Provide only the dinner meal as a string. For example: "Chicken Stir-fry with Brown Rice"`;

      // Prepare the payload for the Gemini API call for a single dinner
      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "text/plain" // Expecting a plain text response for just the dinner name
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const newDinner = result.candidates[0].content.parts[0].text.trim();

        // Fetch image for the newly regenerated dinner
        let newImageUrl: string | null = null; // Fix: Explicitly type as string | null
        try {
          newImageUrl = await fetchDishImage(newDinner);
        } catch (imgErr) {
          console.error("Error fetching image for regenerated meal:", imgErr);
          newImageUrl = 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error';
        }

        // Update the mealPlan state immutably with the new dinner and image
        setMealPlan(prevMealPlan => {
          if (!prevMealPlan) return null; // Ensure prevMealPlan is not null
          const updatedPlan = [...prevMealPlan];
          updatedPlan[index] = {
            ...updatedPlan[index],
            meals: {
              dinner: newDinner
            },
            imageUrl: newImageUrl,
            imageLoading: false
          };
          return updatedPlan;
        });
      } else {
        setError(`Failed to regenerate dinner for ${dayToRegenerate}. No content received.`);
        console.error("Unexpected API response structure for single dinner regeneration:", result);
        setMealPlan(prev => { // Reset loading for this card on error
            if (!prev) return null;
            const newPrev = [...prev];
            newPrev[index] = { ...newPrev[index], imageLoading: false, imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Error' };
            return newPrev;
        });
      }
    } catch (err: any) {
      console.error(`Error regenerating dinner for ${dayToRegenerate}:`, err);
      setError(`Failed to regenerate dinner for ${dayToRegenerate}: ${err.message}.`);
      setMealPlan(prev => { // Reset loading for this card on error
          if (!prev) return null;
          const newPrev = [...prev];
          newPrev[index] = { ...newPrev[index], imageLoading: false, imageUrl: 'https://placehold.co/300x200/ff0000/ffffff?text=Error' };
          return newPrev;
      });
    } finally {
      setRegeneratingDay(null); // Clear the regenerating day state
    }
  };

  /**
   * Generates a simplified shopping list based on the current meal plan and user preferences.
   */
  const generateShoppingList = async () => {
    setLoadingShoppingList(true);
    setShoppingListError('');
    setShoppingList(null);
    setShowShoppingListModal(true); // Open the shopping list modal immediately
    setShoppingListExportSuccessMessage(''); // Clear previous export messages
    setShoppingListExportError('');


    if (!mealPlan || mealPlan.length === 0) {
      setShoppingListError('Please generate a meal plan first.');
      setLoadingShoppingList(false);
      return;
    }

    // Filter out days with empty dinner titles before generating the shopping list
    const mealsForShoppingList = mealPlan.filter(day => day.meals.dinner.trim() !== '');

    if (mealsForShoppingList.length === 0) {
      setShoppingListError('No meals selected for the shopping list. Please add or regenerate some dinners.');
      setLoadingShoppingList(false);
      return;
    }


    try {
      // Create a detailed list of dinners including the number of people for each
      // This list will now reflect any customizations made and saved to mealPlan
      const detailedDinnerList = mealsForShoppingList.map(day =>
        `${day.day}: ${day.meals.dinner} for ${day.people} people`
      ).join('\n');

      // IMPORTANT: Request a plain text response formatted with markdown headings and list items
      const prompt = `Based on the following 7-day dinner plan (including number of people per day) and user preferences, generate a simplified shopping list.
        Dinner Plan:
        ${detailedDinnerList}
        Dietary Preferences: ${dietaryPreferences || 'None'}
        Allergies: ${allergies || 'None'}
        Specific Requirements: ${specificRequirements || 'None'}

        Please provide the shopping list as a plain text string, formatted using markdown.
        Each item MUST include a clear quantity and unit.
        Example format:
        ## Produce
        - 1 head broccoli
        - 2 large bell peppers
        - 500g spinach
        ## Meat & Seafood
        - 1 lb chicken breast
        - 200g cod fillet
        - 4 large eggs
      `;

      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "text/plain" // Expecting a plain text string
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const markdownListString = result.candidates[0].content.parts[0].text;
        // Parse the markdown string into a categorized object
        const categorized = parseShoppingListMarkdown(markdownListString);
        setShoppingList(categorized);
      } else {
        setShoppingListError('No shopping list content received from the AI. Please try again.');
        console.error("Unexpected API response structure for shopping list:", result);
      }
    } catch (err: any) {
      console.error("Error generating shopping list:", err);
      setShoppingListError(`Failed to generate shopping list: ${err.message}.`);
    } finally {
      setLoadingShoppingList(false);
    }
  };

  /**
   * Closes the shopping list modal and clears its content.
   */
  const closeShoppingListModal = () => {
    setShowShoppingListModal(false);
    setShoppingList(null);
    setShoppingListError('');
    setShoppingListExportSuccessMessage('');
    setShoppingListExportError('');
  };

  /**
   * Generates a consolidated meal plan text and copies it to the clipboard.
   */
  const copyMealPlanToClipboard = async () => {
    setExportingMealPlan(true);
    setExportError('');
    setExportSuccessMessage(''); // Clear previous messages

    if (!mealPlan || mealPlan.length === 0) {
      setExportError('Please generate a meal plan first before exporting.');
      setExportingMealPlan(false);
      return;
    }

    try {
      // Filter out days with empty dinner titles before generating the text for clipboard
      const mealsToExport = mealPlan.filter(day => day.meals.dinner.trim() !== '');

      if (mealsToExport.length === 0) {
        setExportError('No meals to export. All days are cleared.');
        setExportingMealPlan(false);
        return;
      }

      const detailedDinnerList = mealsToExport.map(day =>
        `${day.day}: ${cleanMealTitle(day.meals.dinner)} (Serves ${day.people})`
      ).join('\n');

      const prompt = `Consolidate the following 7-day dinner plan into a concise, human-readable text format. Include the day of the week, the dinner, and the number of people it serves. Do not include any introductory or concluding remarks, just the list itself.

        Dinner Plan:
        ${detailedDinnerList}
      `;

      const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
      const payload = {
        contents: chatHistory,
        generationConfig: {
          responseMimeType: "text/plain" // Expecting a plain text string
        }
      };

      // API Key for Gemini API calls - inserted by AI
      const apiKey = "AIzaSyC-x-sDIQ9V3W5f1QzNVsbWaU42TDuWbn4";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const consolidatedText = result.candidates[0].content.parts[0].text.trim();

        // Copy to clipboard
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = consolidatedText;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        try {
          document.execCommand('copy');
          setExportSuccessMessage('Meal plan copied to clipboard!');
        } catch (err) {
          console.error('Failed to copy to clipboard:', err);
          setExportError('Failed to copy meal plan to clipboard. Please try manually copying the text from the plan section.');
        } finally {
          document.body.removeChild(tempTextArea);
        }

      } else {
        setExportError('No consolidated meal plan content received from the AI for export. Please try again.');
        console.error("Unexpected API response structure for export:", result);
      }
    } catch (err: any) {
      console.error("Error exporting meal plan:", err);
      setExportError(`Failed to export meal plan: ${err.message}.`);
    } finally {
      setExportingMealPlan(false);
      // Clear success message after a few seconds
      setTimeout(() => setExportSuccessMessage(''), 5000);
    }
  };

  /**
   * Handles the import of a meal plan from pasted text.
   */
  const handleImportMealPlan = () => {
    setImportError('');
    setImportSuccessMessage('');

    if (!importText.trim()) {
      setImportError('Please paste meal plan text into the box.');
      return;
    }

    const lines = importText.trim().split('\n').filter(line => line.trim() !== '');
    const newMealPlan: MealPlanDay[] = []; // Explicitly type as MealPlanDay[]
    const expectedDays: string[] = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    // Regex to parse a line like "Monday: Salmon with roasted vegetables (Serves 1)"
    const mealPlanRegex = /^([A-Za-z]+):\s*(.+?)\s*\(Serves\s*(\d+)\)$/;

    let parseErrorFound = false;
    lines.forEach((line, index) => {
      const match = line.match(mealPlanRegex);
      if (match) {
        const day = match[1].trim();
        const dinner = match[2].trim();
        const people = parseInt(match[3], 10);

        // Basic validation for day and people count
        if (!expectedDays.includes(day) || isNaN(people) || people < 1) {
          parseErrorFound = true;
          setImportError(`Error on line ${index + 1}: Invalid day or servings format. Please ensure format is 'Day: Meal (Serves X)'.`);
          return;
        }

        newMealPlan.push({
          day: day,
          meals: { dinner: dinner },
          people: people,
          imageUrl: null, // Initialize image URL for imported meals
          imageLoading: false // Initialize image loading state for imported meals
        });
      } else {
        parseErrorFound = true;
        setImportError(`Error on line ${index + 1}: Line does not match expected format 'Day: Meal (Serves X)'.`);
      }
    });

    if (parseErrorFound) {
      // If any line failed to parse, stop and show error
      return;
    }

    // If the imported plan has fewer than 7 days, fill in the rest as empty
    if (newMealPlan.length < 7) {
      const existingDays = new Set(newMealPlan.map(d => d.day));
      expectedDays.forEach(day => {
        if (!existingDays.has(day)) {
          newMealPlan.push({
            day: day,
            meals: { dinner: '' },
            people: 1,
            imageUrl: null,
            imageLoading: false
          });
        }
      });
      // Sort to ensure correct order after adding empty days
      newMealPlan.sort((a, b) => expectedDays.indexOf(a.day) - expectedDays.indexOf(b.day));
    } else if (newMealPlan.length > 7) {
      setImportError(`Expected 7 days in the meal plan, but found ${newMealPlan.length}. Please paste a complete 7-day plan.`);
      return;
    }

    // Optional: Validate if all expected days are present and in order (more robust parsing)
    const parsedDaysOrder = newMealPlan.map(item => item.day);
    const daysMatch = expectedDays.every((day, idx) => parsedDaysOrder[idx] === day);

    if (!daysMatch) {
      setImportError('The imported meal plan does not contain all 7 days in the correct order. Please check the format.');
      return;
    }


    setMealPlan(newMealPlan);
    setImportSuccessMessage('Meal plan imported successfully!');
    setShowImportModal(false); // Close modal on success
    setImportText(''); // Clear text area
    setTimeout(() => setImportSuccessMessage(''), 5000); // Clear success message after 5 seconds

    // Trigger image fetching for imported meals
    fetchImagesForMealPlan(newMealPlan);
  };

  /**
   * Closes the import meal plan modal and resets its state.
   */
  const closeImportModal = () => {
    setShowImportModal(false);
    setImportText('');
    setImportError('');
    setImportSuccessMessage('');
  };

  /**
   * Copies the generated shopping list to the clipboard.
   */
  const copyShoppingListToClipboard = () => {
    setShoppingListExportError('');
    setShoppingListExportSuccessMessage('');

    if (!shoppingList || Object.keys(shoppingList).length === 0) {
      setShoppingListExportError('No shopping list to copy. Please generate one first.');
      return;
    }

    const linesToCopy: string[] = []; // Use an array to build lines
    // Iterate over categories and items to build the text
    for (const category in shoppingList) {
      linesToCopy.push(`## ${category}`); // Markdown for category heading
      shoppingList[category].forEach(item => {
        linesToCopy.push(`- ${item}`); // Markdown for list item
      });
      linesToCopy.push(''); // Add a blank line between categories for readability
    }

    const textToCopy = linesToCopy.join('\n').trim(); // Join and trim trailing newline

    const tempTextArea = document.createElement('textarea');
    tempTextArea.value = textToCopy;
    document.body.appendChild(tempTextArea);
    tempTextArea.select();
    try {
      document.execCommand('copy');
      setShoppingListExportSuccessMessage('Shopping list copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy shopping list to clipboard:', err);
      setShoppingListExportError('Failed to copy shopping list to clipboard. Please try manually copying the text.');
    } finally {
      document.body.removeChild(tempTextArea);
      setTimeout(() => setShoppingListExportSuccessMessage(''), 5000); // Clear success message
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 to-blue-100 p-4 font-sans text-gray-800 flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-4xl text-center mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-purple-700 mb-2 drop-shadow-lg">
          Dinner Plan
        </h1>
        <p className="text-lg text-gray-600">
          Generate your personalized 7-day dinner plan and get recipes!
        </p>
      </header>

      {/* Input Section */}
      <section className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-2xl mb-8 border border-purple-200">
        <h2 className="text-2xl font-bold text-purple-600 mb-6 text-center">Your Preferences</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label htmlFor="dietaryPreferences" className="block text-sm font-medium text-gray-700 mb-1">
              Dietary Preferences (e.g., Vegetarian, Vegan, Keto):
            </label>
            <input
              type="text"
              id="dietaryPreferences"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 transition duration-200"
              value={dietaryPreferences}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDietaryPreferences(e.target.value)}
              placeholder="e.g., Low-carb, Mediterranean"
            />
          </div>
          <div>
            <label htmlFor="allergies" className="block text-sm font-medium text-gray-700 mb-1">
              Allergies (e.g., Nuts, Gluten, Dairy):
            </label>
            <input
              type="text"
              id="allergies"
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 transition duration-200"
              value={allergies}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllergies(e.target.value)}
              placeholder="e.g., Peanuts, Shellfish"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="specificRequirements" className="block text-sm font-medium text-gray-700 mb-1">
              Specific Requirements (e.g., Quick meals, Budget-friendly, High protein):
            </label>
            <textarea
              id="specificRequirements"
              rows={3}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 transition duration-200"
              value={specificRequirements}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSpecificRequirements(e.target.value)}
              placeholder="e.g., Focus on fresh vegetables, Kid-friendly meals"
            ></textarea>
          </div>
          {/* NEW: Limited Cooking Facilities Checkbox */}
          <div className="md:col-span-2 flex items-center mt-4">
            <input
              type="checkbox"
              id="useLimitedFacilities"
              className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
              checked={useLimitedFacilities}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUseLimitedFacilities(e.target.checked)}
            />
            <label htmlFor="useLimitedFacilities" className="ml-2 block text-base font-medium text-gray-700">
              I have limited cooking facilities
            </label>
          </div>
        </div>
        <button
          onClick={generateMealPlan}
          className="mt-8 w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Generating Plan...
            </span>
          ) : (
            'Generate Dinner Plan'
          )}
        </button>
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
            {error}
          </div>
        )}
      </section>

      {/* Always visible Import Meal Plan button and messages */}
      <div className="w-full max-w-4xl text-center mb-8">
        <button
          onClick={() => setShowImportModal(true)}
          className="w-full sm:w-auto bg-yellow-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-yellow-700 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
        >
          Import Meal Plan
        </button>
        {importSuccessMessage && (
          <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg border border-green-300 text-center">
            {importSuccessMessage}
          </div>
        )}
        {importError && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
              {importError}
            </div>
          )}
      </div>


      {/* Meal Plan Display Section (conditional) */}
      {mealPlan && (
        <section className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-4xl mb-8 border border-blue-200">
          <h2 className="text-2xl font-bold text-blue-600 mb-6 text-center">Your 7-Day Dinner Plan</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mealPlan.map((dayPlan, index) => (
              <div
                key={index}
                className="bg-blue-50 p-5 rounded-xl shadow-md border border-blue-100 flex flex-col justify-between transform transition-transform duration-300 hover:scale-103"
              >
                <div>
                  {/* Image Display */}
                  <div className="w-full h-40 bg-gray-200 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                    {dayPlan.imageLoading ? (
                      <svg className="animate-spin h-10 w-10 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : dayPlan.imageUrl ? (
                      <img
                        src={dayPlan.imageUrl}
                        alt={dayPlan.meals.dinner}
                        className="w-full h-full object-cover"
                        // Fallback in case image fails to load after initial fetch
                        onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://placehold.co/300x200/ff0000/ffffff?text=Image+Error'; }}
                      />
                    ) : (
                      <span className="text-gray-500 text-center text-sm">No image available or meal cleared</span>
                    )}
                  </div>

                  {/* Flex container for Day and Serves dropdown */}
                  <div className="flex items-center justify-between mb-3 border-b pb-2 border-blue-200">
                    <h3 className="text-xl font-semibold text-blue-700">
                      {dayPlan.day}
                    </h3>
                    <div className="flex items-center space-x-1"> {/* Adjusted spacing */}
                      <label htmlFor={`people-${index}`} className="text-xs font-medium text-gray-600">Serves:</label>
                      <select
                        id={`people-${index}`}
                        className="p-1 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                        value={dayPlan.people}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePeopleChange(index, parseInt(e.target.value))}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(num => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {editingMealIndex === index ? (
                    <div className="flex flex-col space-y-2">
                      <textarea
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200 text-gray-700"
                        value={editedMealTitle}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditedMealTitle(e.target.value)}
                        rows={2}
                        style={{ resize: 'vertical' }} // Allow vertical resizing
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => saveEditedMeal(index)}
                          className="text-sm bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition duration-200"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEditingMeal}
                          className="text-sm bg-gray-300 text-gray-800 px-3 py-1 rounded-lg hover:bg-gray-400 transition duration-200"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-2 text-gray-700">
                      <li>
                        <span className="font-medium text-blue-600">Dinner:</span>{" "}
                        <span className="inline-block align-top break-words whitespace-pre-wrap">
                          {dayPlan.meals.dinner || 'No meal selected'} {/* Display 'No meal selected' if empty */}
                        </span>
                      </li>
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <div className="flex space-x-2">
                    {editingMealIndex !== index && ( // Only show edit button if not already editing
                      <button
                        onClick={() => startEditingMeal(index, dayPlan.meals.dinner)}
                        className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1 rounded-lg border border-gray-300 hover:bg-gray-100 transition duration-200"
                      >
                        Edit Meal
                      </button>
                    )}
                    <button
                      onClick={() => fetchMealDetails(dayPlan.meals.dinner, dayPlan.people, index)}
                      className="text-sm text-blue-500 hover:text-blue-700 font-medium px-3 py-1 rounded-lg border border-blue-300 hover:bg-blue-100 transition duration-200"
                      disabled={!dayPlan.meals.dinner.trim()} // Disable if no meal is set
                    >
                      Get Recipe
                    </button>
                    <button
                      onClick={() => regenerateDinnerForDay(dayPlan.day, index, dayPlan.people)}
                      className="text-sm bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition duration-200 flex items-center"
                      disabled={regeneratingDay === dayPlan.day}
                    >
                      {regeneratingDay === dayPlan.day ? (
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        'Regenerate'
                      )}
                    </button>
                    <button
                      onClick={() => clearMealForDay(index)}
                      className="text-sm bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition duration-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Action Buttons: Generate Shopping List, Copy Meal Plan (conditional) */}
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <button
              onClick={generateShoppingList}
              className="w-full sm:w-auto bg-indigo-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              disabled={!mealPlan || loadingShoppingList}
            >
              {loadingShoppingList ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Generating Shopping List...
                </span>
              ) : (
                'Generate Shopping List'
              )}
            </button>
            <button
              onClick={copyMealPlanToClipboard}
              className="w-full sm:w-auto bg-green-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              disabled={!mealPlan || exportingMealPlan}
            >
              {exportingMealPlan ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Copying...
                </span>
              ) : (
                'Copy Meal Plan'
              )}
            </button>
          </div>
          {exportError && (
            <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
              {exportError}
            </div>
          )}
        </section>
      )}

      {/* Recipe Details Modal */}
      {showRecipeModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative border border-blue-300">
            <button
              onClick={closeRecipeModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              &times;
            </button>
            <h2 className="text-3xl font-bold text-blue-700 mb-4 border-b pb-2 border-blue-200">
              Recipe: {selectedDinner}
            </h2>

            {/* Loading/Error for initial fetch and customization */}
            {(loadingMealDetails || customizingRecipe) && (
              <div className="flex flex-col items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-3 text-lg text-blue-600">
                  {customizingRecipe ? 'Updating Recipe...' : 'Fetching recipe...'}
                </span>
                <span className="mt-2 text-sm text-gray-500">Calculating estimated calories...</span>
              </div>
            )}

            {(mealDetailsError || customizationError) && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
                {mealDetailsError || customizationError}
              </div>
            )}

            {/* Display Recipe Details */}
            {mealDetails && (
              <div>
                <p className="text-md font-semibold text-gray-700 mb-4">
                  Estimated Calories per Serving: <span className="text-blue-600">{mealDetails.calories || 'N/A'}</span>
                </p>

                <h3 className="text-xl font-semibold text-blue-600 mb-3">Ingredients:</h3>
                <ul className="list-disc list-inside space-y-1 mb-6 text-gray-700">
                  {mealDetails.ingredients.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>

                <h3 className="text-xl font-semibold text-blue-600 mb-3">Instructions:</h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {mealDetails.instructions}
                </p>

                {/* Customize Recipe Section */}
                <div className="mt-8 pt-6 border-t border-blue-200">
                  <h3 className="text-xl font-semibold text-blue-600 mb-4">Customize Recipe</h3>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="customServings" className="block text-sm font-medium text-gray-700 mb-1">
                        Adjust Servings:
                      </label>
                      {/* Changed from input type="number" to select dropdown */}
                      <select
                        id="customServings"
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        value={customServings}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCustomServings(parseInt(e.target.value) || 1)}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(num => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="substitutionRequest" className="block text-sm font-medium text-gray-700 mb-1">
                        Substitution/Customization Request:
                      </label>
                      <textarea
                        id="substitutionRequest"
                        rows={3}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition duration-200"
                        value={substitutionRequest}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSubstitutionRequest(e.target.value)}
                        placeholder="e.g., 'Make it vegetarian', 'Replace rice with quinoa', 'Add more spice'"
                      ></textarea>
                    </div>
                    <button
                      onClick={() => customizeRecipe(selectedDinner)}
                      className="w-full bg-purple-500 text-white py-2 px-4 rounded-lg font-semibold hover:bg-purple-600 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out transform hover:scale-103"
                      disabled={customizingRecipe}
                    >
                      {customizingRecipe ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Updating Recipe...
                        </span>
                      ) : (
                        'Update Recipe'
                      )}
                    </button>
                    {customizationError && (
                      <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
                        {customizationError}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shopping List Modal */}
      {showShoppingListModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative border border-indigo-300">
            <button
              onClick={closeShoppingListModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              &times;
            </button>
            <h2 className="text-3xl font-bold text-indigo-700 mb-4 border-b pb-2 border-indigo-200">
              Your Shopping List
            </h2>

            {loadingShoppingList && (
              <div className="flex items-center justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="ml-3 text-lg text-indigo-600">Generating list...</span>
              </div>
            )}

            {shoppingListError && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
                {shoppingListError}
              </div>
            )}

            {/* Render shopping list with headings based on client-side parsing of markdown */}
            {shoppingList && Object.keys(shoppingList).length > 0 ? (
              <div className="space-y-6">
                {Object.entries(shoppingList).map(([category, items], index) => (
                  <div key={index}>
                    <h3 className="text-xl font-semibold text-indigo-600 mb-2 border-b pb-1 border-indigo-100">
                      {category}
                    </h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700 ml-4">
                      {items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              !loadingShoppingList && !shoppingListError && (
                <p className="text-center text-gray-500">No shopping list generated yet.</p>
              )
            )}

            {/* Shopping List Export Button */}
            <div className="mt-8 pt-6 border-t border-indigo-200">
              <button
                onClick={copyShoppingListToClipboard}
                className="w-full bg-teal-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-teal-700 focus:outline-none focus:ring-4 focus:ring-teal-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                disabled={!shoppingList || Object.keys(shoppingList).length === 0}
              >
                Copy Shopping List
              </button>
              {shoppingListExportSuccessMessage && (
                <div className="mt-4 p-3 bg-green-100 text-green-700 rounded-lg border border-green-300 text-center">
                  {shoppingListExportSuccessMessage}
                </div>
              )}
              {shoppingListExportError && (
                <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
                  {shoppingListExportError}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Import Meal Plan Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative border border-yellow-300">
            <button
              onClick={closeImportModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              &times;
            </button>
            <h2 className="text-3xl font-bold text-yellow-700 mb-4 border-b pb-2 border-yellow-200">
              Import Meal Plan
            </h2>
            <p className="text-gray-600 mb-4">
              Paste your exported 7-day meal plan text here.
              <br />
              <span className="text-sm text-gray-500">
                (Example format: `Monday: Salmon (Serves 4)`)
              </span>
            </p>
            <textarea
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-yellow-500 focus:border-yellow-500 transition duration-200 mb-4"
              rows={10}
              placeholder="Paste your meal plan here..."
              value={importText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImportText(e.target.value)}
            ></textarea>
            <div className="flex justify-end space-x-4">
              <button
                onClick={handleImportMealPlan}
                className="bg-yellow-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-yellow-700 focus:outline-none focus:ring-4 focus:ring-yellow-300 transition duration-300 ease-in-out"
              >
                Import
              </button>
              <button
                onClick={closeImportModal}
                className="bg-gray-300 text-gray-800 py-2 px-4 rounded-lg font-semibold hover:bg-gray-400 focus:outline-none focus:ring-4 focus:ring-gray-300 ease-in-out"
              >
                Cancel
              </button>
            </div>
            {importError && (
              <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg border border-red-300 text-center">
                {importError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* NEW: Cooking Facilities Selection Modal */}
      {showFacilitiesModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto relative border border-purple-300">
            <button
              onClick={() => setShowFacilitiesModal(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 text-2xl font-bold"
            >
              &times;
            </button>
            <h2 className="text-3xl font-bold text-purple-700 mb-4 border-b pb-2 border-purple-200">
              Select Available Cooking Facilities
            </h2>
            <p className="text-gray-600 mb-6">
              Please select all the cooking facilities you have available.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {availableFacilities.map((facility) => (
                <div key={facility} className="flex items-center">
                  <input
                    type="checkbox"
                    id={`facility-${facility}`}
                    className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    checked={selectedFacilities.includes(facility)}
                    onChange={() => handleFacilityToggle(facility)}
                  />
                  <label htmlFor={`facility-${facility}`} className="ml-2 text-base text-gray-700">
                    {facility}
                  </label>
                </div>
              ))}
            </div>
            {selectedFacilities.length === 0 && (
              <p className="text-red-600 text-sm mb-4">
                Please select at least one facility to generate meals.
              </p>
            )}
            <button
              onClick={proceedGenerateMealPlan}
              className="w-full bg-purple-600 text-white py-3 px-6 rounded-xl font-semibold text-lg hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              disabled={selectedFacilities.length === 0} // Disable if no facilities are selected
            >
              Generate Meal Plan with Facilities
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
