import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, orderBy, limit, getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate, useParams } from 'react-router-dom';
import { nanoid } from 'nanoid';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENTID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Replace your OpenRouter API key
const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

function App() {
  // State for research question and model
  const [researchQuestion, setResearchQuestion] = useState("How do users unstuck LLMs.");
  const [model, setModel] = useState("google/gemini-flash-1.5");
  const [tempTranscriptContent, setTempTranscriptContent] = useState("");
  const [paperId, setPaperId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const navigate = useNavigate();
  const { id } = useParams();
  // State for study design
  const [showStudyDesign, setShowStudyDesign] = useState(false);
  const [setting, setSetting] = useState("");
  const [theory, setTheory] = useState("");
  const [numInterviewees, setNumInterviewees] = useState(10);
  const [otherNotes, setOtherNotes] = useState("");

  // State for interview protocol
  const [showInterviewProtocol, setShowInterviewProtocol] = useState(false);
  const [questions, setQuestions] = useState("");
  const [personas, setPersonas] = useState("");

  // State for interview transcripts
  const [showInterviews, setShowInterviews] = useState(false);
  const [transcripts, setTranscripts] = useState("");
  const [parsedTranscripts, setParsedTranscripts] = useState([]);

  // State for qualitative analysis
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState("");

  // State for final study
  const [showStudy, setShowStudy] = useState(false);
  const [finalStudy, setFinalStudy] = useState("");

  // State for loading indicators
  const [isLoading, setIsLoading] = useState(false);

  // State for editing mode
  const [editMode, setEditMode] = useState({
    setting: false,
    theory: false,
    otherNotes: false,
    questions: false,
    personas: false,
    transcripts: false,
    analysisData: false,
    finalStudy: false
  });

  // State for parsed personas
  const [parsedPersonas, setParsedPersonas] = useState([]);

  // State for streaming text - removed separate streaming overlay
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamTarget, setStreamTarget] = useState("");

  // State for previous papers
  const [previousPapers, setPreviousPapers] = useState([]);
  const [showAllPapers, setShowAllPapers] = useState(false);

  // Function to toggle edit mode for a specific field
  const toggleEditMode = (field) => {
    setEditMode(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  useEffect(() => {
    const loadPaperById = async () => {
      if (id) {
        try {
          const paperRef = doc(db, "research-studies", id);
          const paperDoc = await getDoc(paperRef);

          if (paperDoc.exists()) {
            const paperData = paperDoc.data();

            // Set all the state variables from the loaded paper
            setResearchQuestion(paperData.researchQuestion || "");
            setModel(paperData.model || "gpt-4o-mini");
            setSetting(paperData.setting || "");
            setTheory(paperData.theory || "");
            setQuestions(paperData.questions || "");
            setPersonas(paperData.personas || "");
            setTranscripts(paperData.transcripts || "");
            setAnalysisData(paperData.analysisData || "");
            setFinalStudy(paperData.finalStudy || "");
            setPaperId(id);

            // Update display states
            setShowStudyDesign(!!paperData.setting || !!paperData.theory);
            setShowInterviewProtocol(!!paperData.questions || !!paperData.personas);
            setShowInterviews(!!paperData.transcripts);
            setShowAnalysis(!!paperData.analysisData);
            setShowStudy(!!paperData.finalStudy);

            // Process the personas and transcripts
            if (paperData.personas) {
              const individualPersonas = paperData.personas.split(/^\d+\.|\n\d+\.|\n\d+\)/)
                .filter(text => text.trim().length > 0)
                .map(text => text.trim());
              setParsedPersonas(individualPersonas);
            }

            if (paperData.transcripts) {
              processTranscripts(paperData.transcripts);
            }
          } else {
            console.error("No paper found with ID:", id);
            // Maybe show an error message to the user
          }
        } catch (error) {
          console.error("Error loading paper:", error);
        }
      }
    };

    loadPaperById();
  }, [id]);


  // Load previous papers on component mount
  useEffect(() => {
    const loadPreviousPapers = async () => {
      try {
        const papersRef = collection(db, "research-studies");
        const q = query(papersRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        const papers = [];
        querySnapshot.forEach((doc) => {
          papers.push({ id: doc.id, ...doc.data() });
        });

        setPreviousPapers(papers);
      } catch (error) {
        console.error("Error loading previous papers:", error);
      }
    };

    loadPreviousPapers();
  }, []);


  const generatePaperId = () => {
    return nanoid(10); // Creates a 10-character unique ID
  };


  const callOpenRouterWithStreaming = async (prompt, model, targetField) => {
    setIsStreaming(true);
    setStreamTarget(targetField);

    // Initialize appropriate state variable to empty string
    switch (targetField) {
      case "setting":
        setSetting("");
        break;
      case "theory":
        setTheory("");
        break;
      case "questions":
        setQuestions("");
        break;
      case "personas":
        setPersonas("");
        break;
      case "transcripts":
        setTranscripts("");
        break;
      case "transcripts_temp":
        setTempTranscriptContent("");
        break;
      case "analysisData":
        setAnalysisData("");
        break;
      case "finalStudy":
        setFinalStudy("");
        break;
      default:
        break;
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "user", content: prompt }
          ],
          stream: true,
        }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let result = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(line => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.substring(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";
              if (content) {
                result += content;

                // Update the state directly as content streams in
                switch (targetField) {
                  case "setting":
                    setSetting(result);
                    break;
                  case "theory":
                    setTheory(result);
                    break;
                  case "questions":
                    setQuestions(result);
                    break;
                  case "personas":
                    setPersonas(result);
                    break;
                  case "transcripts":
                    setTranscripts(result);
                    break;
                  case "transcripts_temp":
                    setTempTranscriptContent(result);  // Add this case here
                    break;
                  case "analysisData":
                    setAnalysisData(result);
                    break;
                  case "finalStudy":
                    setFinalStudy(result);
                    break;
                  default:
                    break;
                }
              }
            } catch (e) {
              console.error("Error parsing stream data:", e);
            }
          }
        }
      }

      // Process transcripts if needed
      if (targetField === "transcripts") {
        processTranscripts(result);
      }

      return result;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      return "Error generating content. Please try again.";
    } finally {
      setIsStreaming(false);
    }
  };

  // Helper function to call OpenRouter API (non-streaming fallback)
  const callOpenRouter = async (prompt, model) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "user", content: prompt }
          ],
        }),
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling OpenRouter:", error);
      return "Error generating content. Please try again.";
    }
  };

  // Process transcripts to ensure one per persona
  const processTranscripts = (transcriptsText) => {
    // We expect the transcripts to be in a format where each interview is clearly delineated
    // Extract individual transcripts
    const individualTranscripts = [];

    if (parsedPersonas.length > 0) {
      // Iterate through each persona to find corresponding interview
      for (let i = 0; i < parsedPersonas.length; i++) {
        // Extract name from persona (assuming name is in the first line)
        const personaName = parsedPersonas[i].split('\n')[0];

        // Look for sections in the transcript that match this persona
        const regex = new RegExp(`Interview with ${personaName.split(' ')[0]}|Interview \\d+: ${personaName.split(' ')[0]}|${personaName.split(' ')[0]}'s Interview`, 'i');

        let foundTranscript = "";
        const allMatches = transcriptsText.match(regex);

        if (allMatches) {
          // Find the start of this interview
          const startPos = transcriptsText.indexOf(allMatches[0]);

          // Find the start of the next interview (or end of text)
          let endPos;
          if (i < parsedPersonas.length - 1) {
            const nextPersonaName = parsedPersonas[i + 1].split('\n')[0];
            const nextRegex = new RegExp(`Interview with ${nextPersonaName.split(' ')[0]}|Interview \\d+: ${nextPersonaName.split(' ')[0]}|${nextPersonaName.split(' ')[0]}'s Interview`, 'i');
            const nextMatch = transcriptsText.match(nextRegex);
            endPos = nextMatch ? transcriptsText.indexOf(nextMatch[0]) : transcriptsText.length;
          } else {
            endPos = transcriptsText.length;
          }

          foundTranscript = transcriptsText.substring(startPos, endPos).trim();
        }

        // If we couldn't find a matching transcript, create a placeholder
        if (!foundTranscript) {
          foundTranscript = `Interview with ${personaName}\n\nInterviewer: [Interview data not available for this persona]`;
        }

        individualTranscripts.push(foundTranscript);
      }
    } else {
      // Fallback if personas aren't parsed properly
      const defaultSplit = transcriptsText.split(/Interview \d+:|Participant \d+:|Interviewee \d+:|^\d+\.|^\d+\)/)
        .filter(text => text.trim().length > 0)
        .map(text => text.trim());

      for (let i = 0; i < Math.max(defaultSplit.length, numInterviewees); i++) {
        individualTranscripts.push(defaultSplit[i] || `Interview ${i + 1}\n\nInterviewer: [Interview data not available]`);
      }
    }

    setParsedTranscripts(individualTranscripts);
  };

  // Generate study design
  const generateStudyDesign = async () => {
    setIsLoading(true);
    setShowStudyDesign(true);

    // Generate a unique ID for this paper if one doesn't exist yet
    if (!paperId) {
      const newPaperId = generatePaperId();
      setPaperId(newPaperId);

      // Create an initial document in Firestore
      try {
        await setDoc(doc(db, "research-studies", newPaperId), {
          researchQuestion,
          model,
          timestamp: new Date(),
          created: new Date(),
          lastModified: new Date()
        });

        // Update the URL without reloading the page
        navigate(`/paper/${newPaperId}`, { replace: true });
      } catch (error) {
        console.error("Error creating initial paper:", error);
      }
    }

    const settingPrompt = `You are a qualitative research expert. Generate a potential research setting for the following research question: "${researchQuestion}". Keep it concise (1 sentence).`;
    const theoryPrompt = `You are a qualitative research expert. Suggest a theoretical framework that would be appropriate for the following research question: "${researchQuestion}". Just put the name of the theory and a 1 sentence explanation why it is suitable.`;

    try {
      await Promise.all([
        callOpenRouterWithStreaming(settingPrompt, model, "setting"),
        callOpenRouterWithStreaming(theoryPrompt, model, "theory")
      ]);

      // Auto-save after generating study design
      if (paperId) {
        await updateDoc(doc(db, "research-studies", paperId), {
          setting,
          theory,
          lastModified: new Date()
        });
      }
    } catch (error) {
      console.error("Error generating study design:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const savePaper = async () => {
    if (!paperId) {
      // Generate an ID if none exists
      const newPaperId = generatePaperId();
      setPaperId(newPaperId);
      navigate(`/paper/${newPaperId}`, { replace: true });
    }

    setIsSaving(true);
    setSaveMessage("");

    try {
      const paperData = {
        researchQuestion,
        model,
        setting,
        theory,
        questions,
        personas,
        transcripts,
        analysisData,
        finalStudy,
        lastModified: new Date()
      };

      // Check if this is a new paper
      const paperRef = doc(db, "research-studies", paperId);
      const paperDoc = await getDoc(paperRef);

      if (paperDoc.exists()) {
        // Update existing paper
        await updateDoc(paperRef, paperData);
      } else {
        // Create new paper
        paperData.created = new Date();
        paperData.timestamp = new Date();
        await setDoc(paperRef, paperData);
      }

      setSaveMessage("Paper saved successfully!");

      // Refresh the list of previous papers
      const papersRef = collection(db, "research-studies");
      const q = query(papersRef, orderBy("timestamp", "desc"));
      const querySnapshot = await getDocs(q);

      const papers = [];
      querySnapshot.forEach((doc) => {
        papers.push({ id: doc.id, ...doc.data() });
      });

      setPreviousPapers(papers);
    } catch (error) {
      console.error("Error saving paper:", error);
      setSaveMessage("Error saving paper. Please try again.");
    } finally {
      setIsSaving(false);

      // Clear the save message after a few seconds
      setTimeout(() => {
        setSaveMessage("");
      }, 3000);
    }
  };

  // Generate interview protocol
  const generateInterviewProtocol = async () => {
    setIsLoading(true);
    setShowInterviewProtocol(true); // Show section immediately for streaming

    const questionsPrompt = `You are a qualitative research expert. Generate 8-10 open-ended interview questions for a study with the following details:
    - Research question: "${researchQuestion}"
    - Setting: "${setting}"
    - Theoretical framework: "${theory}"
    - Additional notes: "${otherNotes}"
    
    Format the questions as a numbered list. Each question should be designed to elicit rich, detailed responses. Directly send the questions, no intro needed.`;

    const personasPrompt = `You are a qualitative research expert. Generate ${numInterviewees} diverse personas for interviewees for a study with the following details:
    - Research question: "${researchQuestion}"
    - Setting: "${setting}"
    - Theoretical framework: "${theory}"
    
    For each persona, include:
    - Name and age
    - Occupation
    - Brief background relevant to the research topic
    - Level of experience with the research topic
    
    Format as a numbered list with clear separation between personas. Directly send the personas, no intro needed.`;

    try {
      await Promise.all([
        callOpenRouterWithStreaming(questionsPrompt, model, "questions"),
        callOpenRouterWithStreaming(personasPrompt, model, "personas")
      ]);
    } catch (error) {
      console.error("Error generating interview protocol:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const conductInterviews = async () => {
    setIsLoading(true);
    setShowInterviews(true);

    // Initialize state to hold transcripts
    setTranscripts("");
    setParsedTranscripts(Array(parsedPersonas.length).fill(""));

    try {
      // Create a copy of parsedPersonas for local reference
      const personasCopy = [...parsedPersonas];

      // Create an array to track streaming updates
      const updateStreams = [];

      // Function to update a specific transcript
      const updateTranscript = (index, content) => {
        setParsedTranscripts(prev => {
          const updated = [...prev];
          updated[index] = content;
          return updated;
        });
      };

      // Process up to 5 personas at a time
      for (let batch = 0; batch < Math.ceil(personasCopy.length / 5); batch++) {
        const startIdx = batch * 5;
        const endIdx = Math.min(startIdx + 5, personasCopy.length);
        const batchPersonas = personasCopy.slice(startIdx, endIdx);

        // Start streaming for all personas in this batch
        const batchPromises = batchPersonas.map((persona, batchIndex) => {
          const globalIndex = startIdx + batchIndex;
          const personaName = persona.split('\n')[0];

          // Create the interview prompt
          const singleInterviewPrompt = `You are the following persona:
          
  ${persona}
          
  Here are the interview questions:
  ${questions}
          
  Your response should be natural, conversational, and show your unique perspective based on your background. Include some hesitations, specific examples from your experience, and occasional tangents when appropriate.`;

          // Update UI to show which personas are being interviewed
          updateTranscript(
            globalIndex,
            `Interview with ${personaName}\n\nInterviewer: Thank you for participating in this study about "${researchQuestion}". Let's begin with the first question.\n\nInterviewee: [Interview in progress...]`
          );

          // Custom streaming handler for each persona
          return new Promise(async (resolve) => {
            try {
              // Make the API call and get the response
              const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                },
                body: JSON.stringify({
                  model: model,
                  messages: [
                    { role: "user", content: singleInterviewPrompt }
                  ],
                  stream: true,
                }),
              });

              // Set up streaming
              const reader = response.body.getReader();
              const decoder = new TextDecoder("utf-8");
              let transcript = `Interview with ${personaName}:\n\nInterviewer: Thank you for participating in this study about "${researchQuestion}". Let's begin with the first question.\n\n`;

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split("\n").filter(line => line.trim() !== "");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    const data = line.substring(6);
                    if (data === "[DONE]") continue;

                    try {
                      const parsed = JSON.parse(data);
                      const content = parsed.choices[0]?.delta?.content || "";
                      if (content) {
                        transcript += content;
                        updateTranscript(globalIndex, transcript);
                      }
                    } catch (e) {
                      console.error("Error parsing stream data:", e);
                    }
                  }
                }
              }

              // When done, update the final transcript
              updateTranscript(globalIndex, transcript);
              resolve(transcript);
            } catch (error) {
              console.error(`Error conducting interview for persona ${globalIndex}:`, error);
              updateTranscript(
                globalIndex,
                `Interview with ${personaName}\n\nInterviewer: Thank you for participating in this study about "${researchQuestion}".\n\n[Error: Could not complete interview]`
              );
              resolve("");
            }
          });
        });

        // Wait for the current batch to finish before starting the next batch
        // This limits to 5 concurrent interviews
        await Promise.all(batchPromises);
      }

      // Combine all transcripts for the full transcript display
      const fullTranscript = parsedTranscripts.join("\n\n");
      setTranscripts(fullTranscript);

    } catch (error) {
      console.error("Error conducting interviews:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Parse personas when they are generated
  useEffect(() => {
    if (personas) {
      const individualPersonas = personas.split(/^\d+\.|\n\d+\.|\n\d+\)/)
        .filter(text => text.trim().length > 0)
        .map(text => text.trim());

      setParsedPersonas(individualPersonas);
    }
  }, [personas]);

  // Conduct qualitative analysis
  const conductAnalysis = async () => {
    setIsLoading(true);
    setShowAnalysis(true); // Show section immediately for streaming

    // Use JSON.stringify to ensure the full transcript text is included in the prompt
    const analysisPrompt = `You are a qualitative research expert. Conduct a grounded theory analysis of the following interview transcripts:
    ${JSON.stringify(transcripts)}
    
    Organize your analysis in the following format:
    
    1. First-order codes: List 15-20 first-order codes derived directly from the interview data with brief explanations and example quotes.
    
    2. Second-order codes: Group the first-order codes into 5-7 second-order themes that represent broader patterns. Explain the rationale for each grouping.
    
    3. Aggregate dimensions: Identify 2-3 high-level aggregate dimensions that emerge from the second-order themes. Explain how these connect to the research question: "${researchQuestion}".
    
    Include a visual representation of this coding structure as a three-column Markdown table with First-order codes in column 1, Second-order themes in column 2, and Aggregate dimensions in column 3. Make sure your first-order codes are properly aligned with their second-order themes, and second-order themes are properly aligned with their aggregate dimensions.`;

    try {
      await callOpenRouterWithStreaming(analysisPrompt, model, "analysisData");
    } catch (error) {
      console.error("Error conducting analysis:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Write final study
  const writeStudy = async () => {
    setIsLoading(true);
    setShowStudy(true); // Show section immediately for streaming

    const studyPrompt = `You are a qualitative research expert. Write a concise one-page research paper based on the following study:
    
    - Research question: "${researchQuestion}"
    - Setting: "${setting}"
    - Theoretical framework: "${theory}"
    - Methodology: Interviews with ${numInterviewees} participants
    - Analysis results: "${analysisData}"
    
    Structure the paper with the following sections:
    1. Abstract (100 words)
    2. Theoretical Background (200 words)
    3. Methodology (150 words)
    4. Findings (250 words)
    5. Discussion and Implications (200 words)
    
    The total should be approximately 900 words. Use academic writing style but keep it accessible. Format using proper Markdown so it can be displayed nicely.`;

    try {
      const studyResult = await callOpenRouterWithStreaming(studyPrompt, model, "finalStudy");

      // Save to Firebase
      try {
        await addDoc(collection(db, "research-studies"), {
          researchQuestion,
          model,
          setting,
          theory,
          questions,
          personas,
          transcripts,
          analysisData,
          finalStudy: studyResult,
          timestamp: new Date()
        });
        console.log("Study saved to Firebase");

        // Refresh the list of previous papers
        const papersRef = collection(db, "research-studies");
        const q = query(papersRef, orderBy("timestamp", "desc"));
        const querySnapshot = await getDocs(q);

        const papers = [];
        querySnapshot.forEach((doc) => {
          papers.push({ id: doc.id, ...doc.data() });
        });

        setPreviousPapers(papers);
      } catch (e) {
        console.error("Error saving to Firebase: ", e);
      }
    } catch (error) {
      console.error("Error writing study:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Load a previous paper
  const loadPreviousPaper = (paper) => {
    setResearchQuestion(paper.researchQuestion || "");
    setModel(paper.model || "gpt-4o-mini");
    setSetting(paper.setting || "");
    setTheory(paper.theory || "");
    setQuestions(paper.questions || "");
    setPersonas(paper.personas || "");
    setTranscripts(paper.transcripts || "");
    setAnalysisData(paper.analysisData || "");
    setFinalStudy(paper.finalStudy || "");

    // Update display states
    setShowStudyDesign(!!paper.setting || !!paper.theory);
    setShowInterviewProtocol(!!paper.questions || !!paper.personas);
    setShowInterviews(!!paper.transcripts);
    setShowAnalysis(!!paper.analysisData);
    setShowStudy(!!paper.finalStudy);

    // Process the personas and transcripts
    if (paper.personas) {
      const individualPersonas = paper.personas.split(/^\d+\.|\n\d+\.|\n\d+\)/)
        .filter(text => text.trim().length > 0)
        .map(text => text.trim());
      setParsedPersonas(individualPersonas);
    }

    if (paper.transcripts) {
      processTranscripts(paper.transcripts);
    }

    // Close the all papers view
    setShowAllPapers(false);
  };

  // Render the PreviousPapers component
  const renderPreviousPapers = () => {
    return (
      <div className={`fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 ${showAllPapers ? 'block' : 'hidden'}`}>
        <div className="bg-white rounded-lg shadow-xl p-6 m-4 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-medium text-gray-800">All Previous Research Papers</h2>
            <button
              onClick={() => setShowAllPapers(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {previousPapers.length === 0 ? (
            <p className="text-center text-gray-500 py-8">No previous papers found.</p>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {previousPapers.map((paper, idx) => (
                <div key={idx} className="border border-gray-200 rounded-md p-4 hover:bg-gray-50 cursor-pointer" onClick={() => loadPreviousPaper(paper)}>
                  <h3 className="font-medium text-blue-600 mb-2">{paper.researchQuestion}</h3>
                  <div className="flex justify-between text-sm text-gray-500">
                    <span>{paper.model}</span>
                    <span>{paper.timestamp?.toDate().toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render the RecentPapers component for the homepage
  const renderRecentPapers = () => {
    if (!showStudyDesign && previousPapers.length > 0) {
      return (
        <div className="max-w-4xl mx-auto mt-12">
          <h2 className="text-xl font-medium text-gray-700 mb-4">Recent Research Papers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {previousPapers.slice(0, 4).map((paper, idx) => (
              <div
                key={idx}
                className="aspect-[3/4] bg-white border border-gray-200 rounded-md p-4 shadow-sm hover:shadow-md cursor-pointer flex flex-col"
                onClick={() => loadPreviousPaper(paper)}
              >
                <div className="flex-1 flex flex-col">
                  <h3 className="font-medium text-blue-600 text-sm mb-2 line-clamp-3">{paper.researchQuestion}</h3>
                  <div className="mt-auto text-xs text-gray-500">
                    <div>{paper.model}</div>
                    <div>{paper.timestamp?.toDate().toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
            ))}
            <div
              className="aspect-[3/4] bg-gray-50 border border-gray-200 rounded-md flex items-center justify-center cursor-pointer hover:bg-gray-100"
              onClick={() => setShowAllPapers(true)}
            >
              <div className="text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <span className="text-sm text-gray-600">View All</span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const renderAnalysisData = () => {
    return (
      <div className="prose max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisData}</ReactMarkdown>
      </div>
    );
  };

  const renderSaveButton = () => {
    return (
      <div className="flex justify-center mt-6 mb-12">
        <button
          onClick={savePaper}
          disabled={isSaving}
          className={`py-2 px-6 rounded-md font-medium text-white shadow-md transition-colors flex items-center ${isSaving ? 'bg-slate-400' : 'bg-slate-800 hover:bg-slate-700'
            }`}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Paper
            </>
          )}
        </button>
        {saveMessage && (
          <div className="ml-4 bg-black bg-opacity-70 text-white px-4 py-2 rounded-md text-sm">
            {saveMessage}
          </div>
        )}
      </div>
    );
  };



  // 3. Updated with Elsevier-inspired styling
  return (
    <div className="min-h-screen bg-gray-50">
      {renderPreviousPapers()}

      {/* 3. Elsevier-inspired header */}
      <header className="bg-slate-800 text-white py-4 border-b border-slate-700">
  <div className="max-w-6xl mx-auto px-4 flex justify-between items-center">
    <h1 className="text-2xl font-serif">Qualitative Research Paper Simulator</h1>
    <div className="text-sm">
      <span className="opacity-75">Made by</span> Angelo
    </div>
  </div>
</header>

      <div className={`px-4 py-8 ${!showStudyDesign ? 'min-h-screen flex flex-col items-center justify-center' : ''}`}>
        {/* Initial inputs - centered when alone */}
        <div className={`${!showStudyDesign ? 'max-w-md w-full mx-auto' : 'max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8'}`}>
          {!showStudyDesign && (
            <div className="text-center mb-6">
              <h2 className="text-2xl font-serif mb-3 text-slate-800">New Research Study</h2>
              <p className="text-gray-600">
                Enter your research question and select a model to begin the research process.
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Research Question:</label>
            <textarea
              value={researchQuestion}
              onChange={(e) => setResearchQuestion(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">Model:</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="google/gemini-flash-1.5">gemini</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="claude-3-opus">claude-3-opus</option>
              <option value="claude-3-sonnet">claude-3-sonnet</option>
            </select>
          </div>

          <button
            onClick={generateStudyDesign}
            disabled={isLoading || isStreaming}
            className={`w-full py-2 px-4 rounded-md font-medium text-white transition-colors ${isLoading || isStreaming
              ? 'bg-slate-400'
              : 'bg-slate-800 hover:bg-slate-700'
              }`}
          >
            {isLoading && !showStudyDesign ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </span>
            ) : "Generate Study Design"}
          </button>
        </div>

        {/* Recent Papers Section */}
        {renderRecentPapers()}

        {/* Study Design Section */}
        {showStudyDesign && (
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-serif text-slate-800">Study Design</h2>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-serif text-slate-700">Research Setting</h3>
                <button
                  onClick={() => toggleEditMode('setting')}
                  className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {editMode.setting ? "View" : "Edit"}
                </button>
              </div>

              {editMode.setting ? (
                <textarea
                  value={setting}
                  onChange={(e) => setSetting(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="bg-gray-50 p-4 rounded-md">
                  {isStreaming && streamTarget === "setting" ? (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{setting}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{setting}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-serif text-slate-700">Theoretical Framework</h3>
                <button
                  onClick={() => toggleEditMode('theory')}
                  className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {editMode.theory ? "View" : "Edit"}
                </button>
              </div>

              {editMode.theory ? (
                <textarea
                  value={theory}
                  onChange={(e) => setTheory(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="bg-gray-50 p-4 rounded-md">
                  {isStreaming && streamTarget === "theory" ? (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{theory}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{theory}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Interviewees:</label>
                <input
                  type="number"
                  value={numInterviewees}
                  onChange={(e) => setNumInterviewees(parseInt(e.target.value))}
                  min={1}
                  max={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">Other Notes:</label>
                  <button
                    onClick={() => toggleEditMode('otherNotes')}
                    className="text-xs text-slate-600 hover:text-slate-800 flex items-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    {editMode.otherNotes ? "View" : "Edit"}
                  </button>
                </div>

                {editMode.otherNotes ? (
                  <textarea
                    value={otherNotes}
                    onChange={(e) => setOtherNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <div className="bg-gray-50 p-3 rounded-md text-sm h-20 overflow-y-auto">
                    {otherNotes || "No additional notes."}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center">
              <button
                onClick={generateInterviewProtocol}
                disabled={isLoading || isStreaming}
                className={`py-2 px-6 rounded-md font-medium text-white transition-colors ${isLoading || isStreaming
                  ? 'bg-slate-400'
                  : 'bg-slate-800 hover:bg-slate-700'
                  }`}
              >
                {isLoading && !showInterviewProtocol ? "Generating..." : "Generate Interview Protocol"}
              </button>
            </div>
          </div>
        )}

        {/* Interview Protocol Section */}
        {showInterviewProtocol && (
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-serif text-slate-800">Interview Protocol</h2>
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-serif text-slate-700">Interview Questions</h3>
                <button
                  onClick={() => toggleEditMode('questions')}
                  className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {editMode.questions ? "View" : "Edit"}
                </button>
              </div>

              {editMode.questions ? (
                <textarea
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  rows={10}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="bg-gray-50 p-4 rounded-md">
                  {isStreaming && streamTarget === "questions" ? (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{questions}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="prose max-w-none">
                      <ReactMarkdown>{questions}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-serif text-slate-700">Personas</h3>
                <button
                  onClick={() => toggleEditMode('personas')}
                  className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                  {editMode.personas ? "View" : "Edit"}
                </button>
              </div>

              {editMode.personas ? (
                <textarea
                  value={personas}
                  onChange={(e) => setPersonas(e.target.value)}
                  rows={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {isStreaming && streamTarget === "personas" ? (
                    <div className="col-span-full bg-gray-50 p-4 rounded-md">
                      <div className="prose max-w-none">
                        <ReactMarkdown>{personas}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    parsedPersonas.map((persona, idx) => (
                      <div key={idx} className="bg-gray-50 p-3 rounded-md border border-gray-200 text-sm h-60 overflow-y-auto">
                        <div className="font-medium text-slate-600 mb-2">Persona {idx + 1}</div>
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>{persona}</ReactMarkdown>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <button
                onClick={conductInterviews}
                disabled={isLoading || isStreaming}
                className={`py-2 px-6 rounded-md font-medium text-white transition-colors ${isLoading || isStreaming
                  ? 'bg-slate-400'
                  : 'bg-slate-800 hover:bg-slate-700'
                  }`}
              >
                {isLoading && !showInterviews ? "Conducting..." : "Conduct Interviews"}
              </button>
            </div>
          </div>
        )}

        {/* Interview Transcripts Section */}
        {showInterviews && (
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-serif text-slate-800">Interview Transcripts</h2>
              <button
                onClick={() => toggleEditMode('transcripts')}
                className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {editMode.transcripts ? "View" : "Edit"}
              </button>
            </div>

            {editMode.transcripts ? (
              <div className="mb-6">
                <textarea
                  value={transcripts}
                  onChange={(e) => setTranscripts(e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {isStreaming && streamTarget === "transcripts" ? (
                    <div className="col-span-full bg-gray-50 p-4 rounded-md">
                      <div className="prose max-w-none">
                        <ReactMarkdown>{transcripts}</ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    parsedTranscripts.length > 0 ?
                      parsedTranscripts.map((transcript, idx) => (
                        <div key={idx} className="bg-gray-50 p-3 rounded-md border border-gray-200 h-72 overflow-y-auto">
                          <div className="font-medium text-slate-600 mb-2">Interview {idx + 1}</div>
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown>{transcript}</ReactMarkdown>
                          </div>
                        </div>
                      ))
                      :
                      <div className="col-span-full bg-gray-50 p-4 rounded-md">
                        <div className="prose max-w-none">
                          <ReactMarkdown>{transcripts}</ReactMarkdown>
                        </div>
                      </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={conductAnalysis}
                disabled={isLoading || isStreaming}
                className={`py-2 px-6 rounded-md font-medium text-white transition-colors ${isLoading || isStreaming
                  ? 'bg-slate-400'
                  : 'bg-slate-800 hover:bg-slate-700'
                  }`}
              >
                {isLoading && !showAnalysis ? "Analyzing..." : "Conduct Qualitative Text Analysis"}
              </button>
            </div>
          </div>
        )}

        {/* Qualitative Analysis Section */}
        {showAnalysis && (
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-serif text-slate-800">Qualitative Analysis</h2>
              <button
                onClick={() => toggleEditMode('analysisData')}
                className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {editMode.analysisData ? "View" : "Edit"}
              </button>
            </div>

            {editMode.analysisData ? (
              <div className="mb-6">
                <textarea
                  value={analysisData}
                  onChange={(e) => setAnalysisData(e.target.value)}
                  rows={20}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="bg-gray-50 p-6 rounded-md mb-6">
                {isStreaming && streamTarget === "analysisData" ? (
                  <div className="prose max-w-none">
                    <ReactMarkdown>{analysisData}</ReactMarkdown>
                  </div>
                ) : (
                  renderAnalysisData()
                )}
              </div>
            )}

            <div className="flex justify-center">
              <button
                onClick={writeStudy}
                disabled={isLoading || isStreaming}
                className={`py-2 px-6 rounded-md font-medium text-white transition-colors ${isLoading || isStreaming
                  ? 'bg-slate-400'
                  : 'bg-slate-800 hover:bg-slate-700'
                  }`}
              >
                {isLoading && !showStudy ? "Writing..." : "Write Short Study"}
              </button>
            </div>
          </div>
        )}

        {/* Final Study Section - Elsevier journal style */}
        {showStudy && (
          <div className="max-w-5xl mx-auto bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
              <h2 className="text-xl font-serif text-slate-800">Research Paper</h2>
              <button
                onClick={() => toggleEditMode('finalStudy')}
                className="text-sm text-slate-600 hover:text-slate-800 flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                {editMode.finalStudy ? "View" : "Edit"}
              </button>
            </div>

            {editMode.finalStudy ? (
              <div className="mb-6">
                <textarea
                  value={finalStudy}
                  onChange={(e) => setFinalStudy(e.target.value)}
                  rows={25}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ) : (
              <div className="bg-white p-8 rounded-lg border border-gray-200 mb-6">
                <div className="max-w-3xl mx-auto">
                  <div className="prose prose-headings:font-serif prose-headings:text-slate-800 max-w-none">
                    <ReactMarkdown>{finalStudy}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-center space-x-4">
              <button
                onClick={() => {
                  const element = document.createElement("a");
                  const file = new Blob([finalStudy], { type: 'text/plain' });
                  element.href = URL.createObjectURL(file);
                  element.download = `Research_Paper_${new Date().toISOString().slice(0, 10)}.txt`;
                  document.body.appendChild(element);
                  element.click();
                }}
                className="py-2 px-6 rounded-md font-medium text-white bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Download Paper
              </button>
              <button
                onClick={() => {
                  const element = document.createElement("a");
                  const file = new Blob([finalStudy], { type: 'text/markdown' });
                  element.href = URL.createObjectURL(file);
                  element.download = `Research_Paper_${new Date().toISOString().slice(0, 10)}.md`;
                  document.body.appendChild(element);
                  element.click();
                }}
                className="py-2 px-6 rounded-md font-medium border border-slate-800 text-slate-800 hover:bg-slate-50 transition-colors"
              >
                Download as Markdown
              </button>
            </div>
          </div>
        )}
      </div>
      {showStudyDesign && (
        <div className="max-w-5xl mx-auto">
          {renderSaveButton()}
        </div>
      )}
      {/* Elsevier-inspired footer */}
      <footer className="bg-slate-800 text-white py-6 mt-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-lg font-serif mb-2">Qualitative Research Paper Simulator</h3>
              <p className="text-sm text-slate-300">A tool for generating qualitative research papers using AI</p>
            </div>
            <div>
              <p className="text-sm text-slate-300">&copy; {new Date().getFullYear()} All rights reserved</p>
            </div>
          </div>

        </div>

      </footer>

    </div>
  );
}

export default App;