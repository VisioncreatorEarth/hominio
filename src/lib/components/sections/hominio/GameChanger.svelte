<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

	export let sectionRef: HTMLElement | null = null;
    let titleElement: HTMLElement | null = null;

    const fullTitle = "A Game-Changer for Data Interaction";
    let displayedTitle = "";
    let charIndex = 0;
    let titleIntervalId: ReturnType<typeof setInterval> | null = null;
    let titleObserver: IntersectionObserver | null = null;

    // Card types and generation logic - UPDATED
    type CardContentType =
        | { type: 'document'; docName: string; docType: 'Report' | 'Spreadsheet' | 'Presentation' | 'Notes'; }
        | { type: 'task'; taskName: string; dueDate: string; }
        | { type: 'calendarEntry'; eventName: string; eventTime: string; }
        | { type: 'systemStatus'; status: 'Optimal' | 'Warning' | 'Critical' | 'Nominal'; system: string; dotColorClass: string; }
        | { type: 'dataMetric'; metricValue: string; metricLabel: string; };

    interface Card {
        id: number;
        position: { x: number; y: number };
        rotation: number;
        content: CardContentType;
        sizeClass: string;
    }

    const cardCount = 10; 
    const baseRadius = 110; // Increased radius slightly for larger cards

    // UPDATED Data Sources
    const docNames = ["Q3 Sales Report", "Project Alpha Plan", "Client Presentation", "Meeting Minutes", "Competitor Analysis", "Annual Budget", "Marketing Strategy", "Onboarding Guide"];
    const docTypes: ('Report' | 'Spreadsheet' | 'Presentation' | 'Notes')[] = ['Report', 'Spreadsheet', 'Presentation', 'Notes'];

    const taskNames = ["Finalize budget proposal", "Send client update", "Review design mockups", "Schedule team meeting", "Draft blog post", "Test new feature"];
    const dueDates = ["Due Today", "Due Tomorrow", "Due Fri", "Next Week", "Overdue"];

    const eventNames = ["Team Sync", "Client Call", "Product Demo", "Strategy Session", "All Hands", "Sprint Planning"];
    const eventTimes = ["10:00 AM", "2:30 PM", "4:00 PM", "11:30 AM", "9:00 AM"];

    const statuses: ('Optimal' | 'Warning' | 'Critical' | 'Nominal')[] = ['Optimal', 'Warning', 'Critical', 'Nominal'];
    const statusSystems = ["Auth Service", "Database Cluster", "API Gateway", "Billing System", "Frontend Servers", "Worker Nodes", "Payment Processor", "Inventory Mgmt"];
    const dotColorClasses: { [key in typeof statuses[number]]: string } = {
        'Optimal': 'bg-moss-green', // Using solid colors from our palette
        'Warning': 'bg-persian-orange',
        'Critical': 'bg-rosy-brown', // This is more of a muted red/brown
        'Nominal': 'bg-timberwolf-2' 
    };

    const metricValues = ["243 MB", "1.2k", "78%", "3ms", "99.92%", "1.5M", "4 Alerts", "7 Deploys"];
    const metricLabels = ["Active Sessions", "Users Online", "System Uptime", "Avg Response", "Success Rate", "Events Processed", "Open Incidents", "Daily Tasks"];

    const cards: Card[] = Array.from({ length: cardCount }, (_, i): Card => {
        const angle = (i / cardCount) * 2 * Math.PI + (Math.random() - 0.5) * 0.8; 
        const radiusVariation = baseRadius * (0.65 + Math.random() * 0.7); // Adjusted variation
        const x = Math.cos(angle) * radiusVariation;
        const y = Math.sin(angle) * radiusVariation * 0.7; // Elliptical spread

        let cardContent: CardContentType;
        const contentTypeRand = Math.random();
        
        // Removed old data sources like 'labels', 'textCategories', 'statuses' (redefined above), 'statusSystems' (redefined), 'colors' (replaced by dotColorClasses)
        
        const sizeRand = Math.random();
        let sizeClass = "w-32 h-[80px] md:w-36 md:h-[90px]"; // Significantly larger default size
        if (sizeRand > 0.65) {
            sizeClass = "w-36 h-[90px] md:w-40 md:h-[100px]"; // Larger card
        } else if (sizeRand < 0.35) {
            sizeClass = "w-28 h-[70px] md:w-32 md:h-[80px]"; // Smaller card (still larger than before)
        }

        // UPDATED Card Content Generation
        if (contentTypeRand < 0.2) { 
            cardContent = {
                type: 'document',
                docName: docNames[i % docNames.length],
                docType: docTypes[i % docTypes.length]
            };
        } else if (contentTypeRand < 0.4) { 
            cardContent = {
                type: 'task',
                taskName: taskNames[i % taskNames.length],
                dueDate: dueDates[i % dueDates.length]
            };
        } else if (contentTypeRand < 0.6) { 
            cardContent = {
                type: 'calendarEntry',
                eventName: eventNames[i % eventNames.length],
                eventTime: eventTimes[i % eventTimes.length]
            };
        } else if (contentTypeRand < 0.8) { 
            const currentStatus = statuses[i % statuses.length];
            cardContent = {
                type: 'systemStatus',
                status: currentStatus,
                system: statusSystems[i % statusSystems.length],
                dotColorClass: dotColorClasses[currentStatus]
            };
        } else { 
            cardContent = {
                type: 'dataMetric',
                metricValue: metricValues[i % metricValues.length],
                metricLabel: metricLabels[i % metricLabels.length]
            };
        }

        return {
            id: i,
            position: { x, y },
            rotation: (Math.random() - 0.5) * 20, // Slightly less rotation for larger cards
            content: cardContent,
            sizeClass
        };
    });

    onMount(() => {
        if (titleElement) {
            const startTitleAnimation = () => {
                // Reset title and index, clear any existing interval first
                if (titleIntervalId) clearInterval(titleIntervalId);
                displayedTitle = ""; 
            charIndex = 0;

                titleIntervalId = setInterval(() => {
                if (charIndex < fullTitle.length) {
                    displayedTitle += fullTitle[charIndex];
                    charIndex++;
                } else {
                        if (titleIntervalId) clearInterval(titleIntervalId);
                        titleIntervalId = null; // Clear the ID reference
                }
                }, 75);
            };

            const resetTitleAnimation = () => {
                if (titleIntervalId) clearInterval(titleIntervalId);
                titleIntervalId = null;
                displayedTitle = "";
                charIndex = 0;
            };

            titleObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                        // Check if title is empty to prevent restarting if already visible and typing
                        if (displayedTitle === "") { 
                           startTitleAnimation();
                        }
                    } else {
                        // Scrolled out of view, reset animation
                        resetTitleAnimation();
                }
            });
        }, { threshold: 0.2 });

            titleObserver.observe(titleElement);
        }
        return () => {
            if (titleIntervalId) clearInterval(titleIntervalId); // Clear interval on component destroy
            if (titleObserver && titleElement) {
                titleObserver.unobserve(titleElement);
            }
             if (titleObserver) {
                 titleObserver.disconnect(); // Disconnect observer on destroy
             }
        }
    });

</script>

<section bind:this={sectionRef} data-section="4" class="py-16 md:py-24 bg-linen text-prussian-blue">
    <div class="w-full max-w-5xl mx-auto px-4 md:px-8 grid grid-cols-1 md:grid-cols-2 gap-x-12 md:gap-x-16 items-center">
        
        <div class="text-center md:text-left">
            <h2 class="font-playfair-display text-5xl md:text-6xl lg:text-7xl font-normal mb-6 min-h-[100px] md:min-h-[150px] lg:min-h-[200px]" bind:this={titleElement}>{displayedTitle}<span class="animate-blink">|</span></h2>
            <p class="font-ibm-plex-sans text-xl md:text-2xl text-prussian-blue/90">
                Traditional data tools trap you in endless app switching—toggling between calendars, note apps, spreadsheets, and email. Hominio shatters those limits—<span class="text-persian-orange font-medium">voice-driven Vibes</span> let you ask questions, take action, and automate workflows in real time. It's not just a new way to work with data; it's a whole new class of interaction.
            </p>
        </div>

        <!-- Right Column: Static visual -->
        <div class="flex flex-col items-center justify-center min-h-[550px] md:min-h-[600px] relative py-4">

            <!-- Card Cluster -->
            <div class="relative w-full h-[280px] md:h-[340px] mb-6 md:mb-8"> 
                {#each cards as card (card.id)}
                    <!-- Card -->
                    <div class="absolute bg-timberwolf-1/60 border border-timberwolf-2/70 rounded-xl shadow-lg flex flex-col items-center justify-center p-2.5 text-prussian-blue {card.sizeClass}"
                         style="left: 50%; top: 50%;
                                transform: translate(-50%, -50%) translate({card.position.x}px, {card.position.y}px) rotate({card.rotation}deg);">
                        
                        {#if card.content.type === 'document'}
                            <p class="font-ibm-plex-sans text-xs md:text-sm font-semibold text-prussian-blue mb-0.5 text-center leading-tight">{card.content.docName}</p>
                            <p class="font-ibm-plex-sans text-[10px] md:text-xs text-prussian-blue/70 text-center leading-tight">({card.content.docType})</p>
                        {:else if card.content.type === 'task'}
                            <p class="font-ibm-plex-sans text-xs md:text-sm font-semibold text-prussian-blue mb-0.5 text-center leading-tight">{card.content.taskName}</p>
                            <p class="font-ibm-plex-sans text-[10px] md:text-xs text-prussian-blue/70 text-center leading-tight">{card.content.dueDate}</p>
                        {:else if card.content.type === 'calendarEntry'}
                            <p class="font-ibm-plex-sans text-xs md:text-sm font-semibold text-prussian-blue mb-0.5 text-center leading-tight">{card.content.eventName}</p>
                            <p class="font-ibm-plex-sans text-[10px] md:text-xs text-prussian-blue/70 text-center leading-tight">{card.content.eventTime}</p>
                        {:else if card.content.type === 'systemStatus'}
                            <div class="flex items-center space-x-1.5 md:space-x-2 mb-0.5">
                                <div class="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full {card.content.dotColorClass}"></div>
                                <span class="font-ibm-plex-sans text-xs md:text-sm text-prussian-blue/90 font-semibold leading-tight">{card.content.status}</span>
                            </div>
                             <p class="font-ibm-plex-sans text-[9px] md:text-[10px] text-prussian-blue/60 leading-tight text-center">{card.content.system}</p>
                        {:else if card.content.type === 'dataMetric'}
                            <span class="font-ibm-plex-sans font-semibold text-prussian-blue text-lg md:text-xl leading-none">{card.content.metricValue}</span>
                            <p class="font-ibm-plex-sans text-[10px] md:text-xs text-prussian-blue/70 mt-0.5 leading-tight text-center">{card.content.metricLabel}</p>
                        {/if}
                    </div>
                {/each}
            </div>
            
            <!-- Text: Digital Chaos Simplified -->
            <p class="font-playfair-display text-xl md:text-2xl text-prussian-blue mb-6 md:mb-8 text-center tracking-wider">
                Digital Chaos Simplified
            </p>
            
            <!-- Microphone Icon and new descriptive text -->
            <div class="flex flex-col items-center text-center">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8 md:w-9 md:h-9 text-prussian-blue/80 mb-3 md:mb-4">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15a.994.994 0 0 0-.98-.85c-.61 0-1.09.54-1 1.14.49 3.02 2.86 5.38 5.91 5.78V21h-2v2h6v-2h-2v-2.08c3.05-.4 5.42-2.76 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
                </svg>

                <p class="font-ibm-plex-sans text-xl md:text-2xl text-prussian-blue/95 px-4 leading-relaxed">
                    Explore your data through <span class="font-semibold text-persian-orange">VIBES</span>, all by your voice.
                </p>
            </div>
        </div>
    </div>
</section>

<style>
    @keyframes blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0; }
	}
	.animate-blink {
		animation: blink 1s step-end infinite;
	}
    .data-card {
        /* Basic styles for data cards if any needed beyond inline */
        /* Ensure text doesn't wrap awkwardly, though content is short */
        white-space: normal; 
	}
</style> 