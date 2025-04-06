// Initialize the map
const map = L.map("map").setView([53.462, 10.0751], 4);

// Add base map layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

// Store loaded tracks for management
const loadedTracks = [];
// Queue for batch processing
let processingQueue = [];
let isProcessing = false;
let processedCount = 0;
let totalToProcess = 0;

// Track list element
const trackListElement = document.getElementById("tracks");

// Add these elements to your HTML
if (!document.getElementById("progress-container")) {
  const progressContainer = document.createElement("div");
  progressContainer.id = "progress-container";
  progressContainer.style.display = "none";
  progressContainer.innerHTML = `
    <div class="progress-bar-container">
      <div id="progress-bar" class="progress-bar"></div>
    </div>
    <div id="progress-text">Processing files: 0/0</div>
  `;
  document.querySelector(".upload-container").appendChild(progressContainer);

  // Add styles to the head
  const style = document.createElement("style");
  style.textContent = `
    .progress-bar-container {
      width: 100%;
      background-color: #e0e0e0;
      border-radius: 4px;
      margin: 15px 0;
      height: 20px;
    }
    .progress-bar {
      height: 100%;
      background-color: #4CAF50;
      border-radius: 4px;
      width: 0%;
      transition: width 0.3s;
    }
    #progress-text {
      margin-top: 5px;
      font-size: 14px;
    }
    .filter-container {
      margin: 15px 0;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    #track-search {
      padding: 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      flex-grow: 1;
      max-width: 300px;
    }
    .pagination {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin: 20px 0;
    }
    .pagination button {
      background-color: #f0f0f0;
      color: #333;
    }
    .pagination button.active {
      background-color: #4CAF50;
      color: white;
    }
    #load-all-button {
      background-color: #ff9800;
      margin-left: 10px;
    }
  `;
  document.head.appendChild(style);

  // Add search/filter functionality
  const filterContainer = document.createElement("div");
  filterContainer.className = "filter-container";
  filterContainer.innerHTML = `
    <input type="text" id="track-search" placeholder="Search tracks...">
    <button id="load-all-button">Load All Tracks</button>
  `;
  document.querySelector("h2").after(filterContainer);
}

// Process GPX upload
document.getElementById("upload-button").addEventListener("click", function () {
  const fileInput = document.getElementById("gpx-upload");
  handleFileUpload(fileInput.files);
});

// Search functionality
document.getElementById("track-search").addEventListener("input", function (e) {
  const searchTerm = e.target.value.toLowerCase();
  document.querySelectorAll(".track-item").forEach((item) => {
    const trackName = item.querySelector("strong").textContent.toLowerCase();
    if (trackName.includes(searchTerm)) {
      item.style.display = "block";
    } else {
      item.style.display = "none";
    }
  });
});

// Load all tracks button
document
  .getElementById("load-all-button")
  .addEventListener("click", function () {
    // Check if there are many tracks
    if (loadedTracks.length > 25) {
      if (
        !confirm(
          `Are you sure you want to load all ${loadedTracks.length} tracks? This may slow down your browser.`,
        )
      ) {
        return;
      }
    }

    loadedTracks.forEach((track) => {
      if (!track.visible) {
        track.layer.addTo(map);
        track.visible = true;
        const trackItem = document.getElementById(track.id);
        trackItem.querySelector(".toggle").textContent = "Hide";
        trackItem.style.opacity = 1;
      }
    });

    // Fit map to show all tracks
    if (loadedTracks.length > 0) {
      const bounds = L.latLngBounds();
      loadedTracks.forEach((track) => {
        bounds.extend(track.layer.getBounds());
      });
      map.fitBounds(bounds);
    }
  });

function handleFileUpload(files) {
  if (!files.length) {
    alert("Please select GPX files to upload");
    return;
  }

  // Convert FileList to Array and filter for GPX files
  const filesToProcess = Array.from(files).filter((file) =>
    file.name.toLowerCase().endsWith(".gpx"),
  );

  if (filesToProcess.length === 0) {
    alert("No GPX files found in selection");
    return;
  }

  // If uploading many files, confirm with the user
  if (filesToProcess.length > 50) {
    if (
      !confirm(
        `You are about to process ${filesToProcess.length} GPX files. This may take some time and use significant memory. Continue?`,
      )
    ) {
      return;
    }
  }

  // Add files to the processing queue
  processingQueue = [...processingQueue, ...filesToProcess];
  totalToProcess = processingQueue.length;

  // Show progress UI
  const progressContainer = document.getElementById("progress-container");
  progressContainer.style.display = "block";

  // Start processing if not already in progress
  if (!isProcessing) {
    processedCount = 0;
    processBatch();
  }

  // Reset the file input after queueing
  document.getElementById("gpx-upload").value = "";
}

function updateProgressBar() {
  const percentage = (processedCount / totalToProcess) * 100;
  document.getElementById("progress-bar").style.width = percentage + "%";
  document.getElementById("progress-text").textContent =
    `Processing files: ${processedCount}/${totalToProcess}`;
}

function processBatch() {
  isProcessing = true;

  // Process a smaller batch at a time
  const batchSize = 5;
  const currentBatch = processingQueue.slice(0, batchSize);
  processingQueue = processingQueue.slice(batchSize);

  // If no more files to process in this run
  if (currentBatch.length === 0) {
    isProcessing = false;

    // Hide progress after a delay
    setTimeout(() => {
      document.getElementById("progress-container").style.display = "none";
    }, 1500);

    return;
  }

  // Process current batch
  let completedInBatch = 0;

  currentBatch.forEach((file) => {
    processGpxFile(file, () => {
      completedInBatch++;
      processedCount++;

      // Update progress UI
      updateProgressBar();

      // When batch is complete, process next batch
      if (completedInBatch === currentBatch.length) {
        // Use setTimeout to give the browser a chance to update UI
        setTimeout(processBatch, 10);
      }
    });
  });
}

function processGpxFile(file, callback) {
  const reader = new FileReader();

  reader.onload = function (e) {
    const color = "#FF0000";
    const gpxData = e.target.result;

    // Create a Blob URL for the GPX data
    const blob = new Blob([gpxData], { type: "application/gpx+xml" });
    const url = URL.createObjectURL(blob);

    // Create unique track ID
    const trackId =
      "track-" + Date.now() + "-" + Math.floor(Math.random() * 1000);

    // Load the GPX file using the URL
    const gpxTrack = new L.GPX(url, {
      async: true,
      polyline_options: {
        color: color,
        weight: 3,
        opacity: 0.9,
      },
      marker_options: {
        startIconUrl: "",
        endIconUrl: "",
        shadowUrl: "",
        wptIconUrls: { "": "" },
      },
    });

    // When track is loaded
    gpxTrack.on("loaded", function (e) {
      const gpx = e.target;

      // Get track details
      const trackName = gpx.get_name() || file.name;
      const distance = (gpx.get_distance() / 1000).toFixed(1); // km
      const elevGain = gpx.get_elevation_gain().toFixed(0); // m

      // Calculate track time if available
      let timeInfo = "";
      if (gpx.get_start_time() && gpx.get_end_time()) {
        const durationMs = gpx.get_end_time() - gpx.get_start_time();
        const hours = Math.floor(durationMs / 3600000);
        const minutes = Math.floor((durationMs % 3600000) / 60000);
        timeInfo = `<br>Duration: ${hours}h ${minutes}m`;
      }

      // Store track data for management
      const trackData = {
        id: trackId,
        name: trackName,
        color: color,
        layer: gpxTrack,
        visible: true,
        url: url,
        distance: distance,
        elevGain: elevGain,
      };

      loadedTracks.push(trackData);

      // Create track list item
      const trackItem = document.createElement("div");
      trackItem.id = trackId;
      trackItem.className = "track-item";
      trackItem.innerHTML = `
        <div style="border-left: 6px solid ${color}; padding-left: 10px;">
          <strong>${trackName}</strong>
          <p>
            Distance: ${distance} km<br>
            Elevation: ${elevGain} m
            ${timeInfo}
          </p>
          <div class="track-controls">
            <button class="toggle">Hide</button>
            <button class="remove">Remove</button>
          </div>
        </div>
      `;

      // Click on track item to zoom to track
      trackItem.addEventListener("click", function (e) {
        // Don't zoom if clicking on a button
        if (e.target.tagName !== "BUTTON") {
          map.fitBounds(gpx.getBounds());
        }
      });

      // Add toggle visibility functionality
      const toggleBtn = trackItem.querySelector(".toggle");
      toggleBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        const track = loadedTracks.find((t) => t.id === trackId);

        if (track.visible) {
          map.removeLayer(track.layer);
          track.visible = false;
          this.textContent = "Show";
          trackItem.style.opacity = 0.6;
        } else {
          track.layer.addTo(map);
          track.visible = true;
          this.textContent = "Hide";
          trackItem.style.opacity = 1;
        }
      });

      // Add remove functionality
      const removeBtn = trackItem.querySelector(".remove");
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();

        const trackIndex = loadedTracks.findIndex((t) => t.id === trackId);
        if (trackIndex !== -1) {
          // Remove from map
          map.removeLayer(loadedTracks[trackIndex].layer);

          // Release the blob URL
          URL.revokeObjectURL(loadedTracks[trackIndex].url);

          // Remove from array
          loadedTracks.splice(trackIndex, 1);

          // Remove from DOM
          trackItem.remove();
        }
      });

      // Add to track list
      trackListElement.appendChild(trackItem);

      // For large numbers of files, don't automatically add to map
      if (totalToProcess > 25) {
        // If this is among the first 10 tracks, show them
        if (loadedTracks.length <= 10) {
          // Leave on map
        } else {
          // Hide by default to improve performance
          map.removeLayer(gpxTrack);
          trackData.visible = false;
          toggleBtn.textContent = "Show";
          trackItem.style.opacity = 0.6;
        }
      }

      if (callback) callback();
    });

    // Handle errors
    gpxTrack.on("error", function () {
      console.error(`Error processing file: ${file.name}`);
      if (callback) callback();
    });

    gpxTrack.addTo(map);
  };

  reader.onerror = function () {
    console.error(`Error reading file: ${file.name}`);
    if (callback) callback();
  };

  reader.readAsText(file);
}
